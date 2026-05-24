import {
  fetchVoteDetailsParallel,
  fetchVoteMenu,
} from "./fetch";
import {
  readPipelineCheckpoint,
  writeHistoricalVoteBatchToD1,
  writePipelineCheckpoint,
  writeVoteEvidenceToD1,
} from "./d1";
import type { PipelineJob } from "./platform-types";
import { parseVoteDetailXml, parseVoteMenuXml } from "./xml";
import { extractVoteEvidence } from "./vote-evidence";
import {
  buildVoteLedgerKey,
  buildSessionOverviewKey,
  buildActivitiesIndexKey,
  readJsonFromR2,
} from "./storage";
import {
  HISTORICAL_BACKFILL_BATCH_SIZE,
  logEvent,
  PIPELINE_FETCH_CONFIG,
} from "./pipeline-logging";
import type { PipelineEnv } from "./pipeline-env";
import type { ActivityIndexJson, SessionOverview, VoteLedger } from "./types";
import {
  buildVoteDetailResponse,
  materializeReadModels,
  readLatestChamberContext,
} from "./pipeline-materialize";

export async function enqueuePipelineJob(env: PipelineEnv, job: PipelineJob): Promise<boolean> {
  if (!env.PIPELINE_QUEUE) return false;
  try {
    await env.PIPELINE_QUEUE.send(job);
    return true;
  } catch (error) {
    logEvent("pipeline_queue_enqueue_failed", {
      type: job.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function processExtractVoteEvidenceJob(
  job: Extract<PipelineJob, { type: "extract_vote_evidence" }>,
  env: PipelineEnv
): Promise<void> {
  if (!env.SENATE_DB) {
    logEvent("extract_vote_evidence_skipped", {
      reason: "missing_d1",
      congress: job.congress,
      session: job.session,
      vote_number: job.vote_number,
    });
    return;
  }

  const [ledger, overview, activityIndex, context] = await Promise.all([
    readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
    readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
    readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
    readLatestChamberContext(env.DATA_BUCKET),
  ]);
  if (!ledger || !overview) {
    throw new Error("Vote evidence job missing ledger or overview in storage");
  }

  const detail = buildVoteDetailResponse(ledger, overview, activityIndex, job.vote_number, "derived");
  if (!detail) {
    logEvent("extract_vote_evidence_skipped", {
      reason: "vote_detail_missing",
      congress: job.congress,
      session: job.session,
      vote_number: job.vote_number,
    });
    return;
  }

  const evidence = await extractVoteEvidence(
    env,
    detail,
    overview,
    context,
    PIPELINE_FETCH_CONFIG
  );
  await writeVoteEvidenceToD1(
    env.SENATE_DB,
    detail.vote.congress,
    detail.vote.session,
    detail.vote.vote_number,
    evidence
  );

  logEvent("extract_vote_evidence_complete", {
    congress: job.congress,
    session: job.session,
    vote_number: job.vote_number,
    excerpts: evidence.excerpts.length,
    documents: evidence.documents.length,
  });
}

export async function processHistoricalBackfillJob(
  job: Extract<PipelineJob, { type: "historical_backfill" }>,
  env: PipelineEnv
): Promise<void> {
  if (!env.SENATE_DB) {
    logEvent("historical_backfill_skipped", {
      reason: "missing_d1",
      congress: job.congress,
      session: job.session ?? null,
    });
    return;
  }

  const sessions = job.session ? [job.session] : [1, 2];
  const checkpointKey = `historical_backfill:${job.congress}:${job.session ?? "all"}`;
  const inlineMode = !env.PIPELINE_QUEUE;
  let resumed = false;

  while (true) {
    const checkpoint = await readPipelineCheckpoint<{ session_index: number; offset: number }>(
      env.SENATE_DB,
      checkpointKey
    );
    let sessionIndex = checkpoint?.cursor.session_index ?? 0;
    let offset = checkpoint?.cursor.offset ?? 0;
    resumed = resumed || Boolean(checkpoint);

    if (sessionIndex >= sessions.length) {
      logEvent("historical_backfill_complete", {
        congress: job.congress,
        session: job.session ?? null,
        resumed,
      });
      return;
    }

    const targetSession = sessions[sessionIndex];
    const menuResult = await fetchVoteMenu(job.congress, targetSession, PIPELINE_FETCH_CONFIG);
    if (!menuResult.success || !menuResult.data) {
      throw new Error(menuResult.error ?? "Failed to fetch vote menu for historical backfill");
    }

    const menuVotes = parseVoteMenuXml(menuResult.data).sort((a, b) => a.vote_number - b.vote_number);
    const batch = menuVotes.slice(offset, offset + HISTORICAL_BACKFILL_BATCH_SIZE);
    if (batch.length === 0) {
      sessionIndex += 1;
      offset = 0;
      await writePipelineCheckpoint(env.SENATE_DB, checkpointKey, {
        session_index: sessionIndex,
        offset,
      });
      if (!inlineMode && sessionIndex < sessions.length) {
        await enqueuePipelineJob(env, {
          type: "historical_backfill",
          created_at: new Date().toISOString(),
          congress: job.congress,
          session: job.session,
        });
        return;
      }
      continue;
    }

    const detailResults = await fetchVoteDetailsParallel(
      batch.map((entry) => entry.vote_number),
      job.congress,
      targetSession,
      { ...PIPELINE_FETCH_CONFIG, concurrency: 2 }
    );
    const parsed = batch
      .map((entry) => detailResults.results.get(entry.vote_number)?.data)
      .filter((value): value is string => Boolean(value))
      .map((xml) => parseVoteDetailXml(xml, job.congress, targetSession))
      .filter((value): value is NonNullable<ReturnType<typeof parseVoteDetailXml>> => Boolean(value));

    await writeHistoricalVoteBatchToD1(env.SENATE_DB, parsed);

    const nextOffset = offset + batch.length;
    await writePipelineCheckpoint(env.SENATE_DB, checkpointKey, {
      session_index: sessionIndex,
      offset: nextOffset,
    });

    logEvent("historical_backfill_batch_complete", {
      congress: job.congress,
      session: targetSession,
      offset,
      processed: parsed.length,
      total_menu_votes: menuVotes.length,
      inline: inlineMode,
    });

    if (nextOffset < menuVotes.length || sessionIndex < sessions.length - 1) {
      if (!inlineMode) {
        await enqueuePipelineJob(env, {
          type: "historical_backfill",
          created_at: new Date().toISOString(),
          congress: job.congress,
          session: job.session,
        });
        return;
      }
      continue;
    }

    await writePipelineCheckpoint(env.SENATE_DB, checkpointKey, {
      session_index: sessions.length,
      offset: 0,
    });
    logEvent("historical_backfill_complete", {
      congress: job.congress,
      session: job.session ?? null,
      resumed,
    });
    return;
  }
}

export async function processPipelineJob(job: PipelineJob, env: PipelineEnv): Promise<void> {
  if (job.type === "materialize_read_models") {
    const [ledger, overview, activityIndex] = await Promise.all([
      readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
      readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
      readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
    ]);
    if (!ledger || !overview) {
      throw new Error("Materialization job missing ledger or overview in storage");
    }
    await materializeReadModels(env, ledger, overview, activityIndex);
    return;
  }

  if (job.type === "historical_backfill") {
    await processHistoricalBackfillJob(job, env);
    return;
  }

  if (job.type === "extract_vote_evidence") {
    await processExtractVoteEvidenceJob(job, env);
  }
}

export function handleQueue(
  batch: MessageBatch<PipelineJob>,
  env: PipelineEnv,
  ctx: ExecutionContext
): void {
  for (const message of batch.messages) {
    ctx.waitUntil(
      processPipelineJob(message.body, env)
        .then(() => message.ack())
        .catch((error) => {
          logEvent("pipeline_queue_job_failed", {
            type: message.body.type,
            error: error instanceof Error ? error.message : String(error),
          });
          message.retry();
        })
    );
  }
}
