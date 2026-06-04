import {
  fetchVoteDetailsParallel,
  fetchVoteMenu,
  type FetchConfig,
} from "../fetch";
import { readPipelineCheckpoint, writePipelineCheckpoint } from "../d1/checkpoints";
import { writeHistoricalVoteBatchToD1 } from "../d1/materialization";
import type { PipelineJob } from "../platform-types";
import { parseVoteDetailXml, parseVoteMenuXml } from "../xml";
import {
  HISTORICAL_BACKFILL_BATCH_SIZE,
  logEvent,
  PIPELINE_FETCH_CONFIG,
} from "./logging";
import type { Env } from "../config";
import { buildRuntime, type Runtime } from "../runtime";
import { materializeReadModelsFromStorage } from "./materialize";

export async function enqueuePipelineJob(env: Env, job: PipelineJob): Promise<boolean> {
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

export async function processHistoricalBackfillJob(
  job: Extract<PipelineJob, { type: "historical_backfill" }>,
  env: Env,
  runtime: Runtime = buildRuntime(env)
): Promise<void> {
  const sessions = job.session ? [job.session] : [1, 2];
  const checkpointKey = `historical_backfill:${job.congress}:${job.session ?? "all"}`;
  const inlineMode = !env.PIPELINE_QUEUE;
  const fetchConfig: FetchConfig = { ...PIPELINE_FETCH_CONFIG, fixture: runtime.fixtureHttp };
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
    const menuResult = await fetchVoteMenu(job.congress, targetSession, fetchConfig);
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
      { ...fetchConfig, concurrency: 2 }
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

export async function processPipelineJob(
  job: PipelineJob,
  env: Env,
  runtime: Runtime = buildRuntime(env)
): Promise<void> {
  if (job.type === "materialize_read_models") {
    await materializeReadModelsFromStorage(env);
    return;
  }

  if (job.type === "historical_backfill") {
    await processHistoricalBackfillJob(job, env, runtime);
  }
}

export function handleQueue(
  batch: MessageBatch<PipelineJob>,
  env: Env,
  ctx: ExecutionContext,
  runtime: Runtime = buildRuntime(env)
): void {
  for (const message of batch.messages) {
    ctx.waitUntil(
      processPipelineJob(message.body, env, runtime)
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
