import type { PipelineJob } from "../platform-types";
import type { Env } from "../config";
import type { FetchConfig } from "../fetch";
import { buildRuntime, type Runtime } from "../runtime";
import {
  buildVoteLedgerUpdate,
  discoverVoteLedgerUpdates,
} from "../ingest";
import { runMemberIngestion } from "../member-ingest";
import {
  collectUniqueBills,
  buildBillEvidencePipeline,
  materializeReadModels,
} from "./materialize";
import {
  attachEvidenceToActivities,
  fetchAndParseVoteMenu,
  resolveActivityIndex,
} from "./ingestion-helpers";
import {
  diffVoteNumbers,
  logEvent,
  makeRunId,
  PIPELINE_FETCH_CONFIG,
  runTimed,
  summarizeCoverage,
} from "./logging";
import { enqueuePipelineJob } from "./jobs";

export async function runScheduledIngestion(
  env: Env,
  runtime: Runtime = buildRuntime(env)
): Promise<void> {
  const runId = makeRunId();
  const startTime = Date.now();
  logEvent("scheduled_ingestion_start", {
    run_id: runId,
    timestamp: new Date().toISOString(),
  });

  const config = runtime.config;
  const now = runtime.clock.now();
  const fetchConfig: FetchConfig = { ...PIPELINE_FETCH_CONFIG, fixture: runtime.fixtureHttp };

  const menuVotes = await runTimed(runId, "fetch_vote_menu", () =>
    fetchAndParseVoteMenu(config.congress, config.session, fetchConfig)
  );

  const discovery = await runTimed(runId, "discover_vote_updates", () =>
    discoverVoteLedgerUpdates(config, null, {
      fetchConfig,
      now,
      menuVotes: menuVotes ?? undefined,
    })
  );

  const memberResult = await runTimed(runId, "member_ingestion", () =>
    runMemberIngestion(
      {
        congress: config.congress,
        session: config.session,
        congressApiKey: config.congressApiKey,
        govInfoApiKey: config.govInfoApiKey,
        lookbackDays: config.activityLookbackDays,
        now,
        fixture: runtime.fixtureHttp,
        menuVotes: menuVotes ?? undefined,
      },
      fetchConfig
    )
  );

  if (!memberResult.success || !memberResult.membersIndex) {
    throw new Error(`[scheduled] Member ingestion failed: ${memberResult.error ?? "unknown error"}`);
  }
  const membersIndex = memberResult.membersIndex;

  const effectiveActivityIndex = resolveActivityIndex(memberResult);

  const billsByKey = collectUniqueBills(memberResult.memberActivities, effectiveActivityIndex);
  const evidencePipeline = await runTimed(runId, "bill_evidence_pipeline", () =>
    buildBillEvidencePipeline(billsByKey, {
      runId,
      congressApiKey: config.congressApiKey,
      session: config.session,
      maxBills: config.evidence.maxBills,
      billConcurrency: config.evidence.billConcurrency,
      endpointFanout: config.evidence.endpointFanout,
      fixture: runtime.fixtureHttp,
    })
  );

  attachEvidenceToActivities(
    memberResult.memberActivities,
    effectiveActivityIndex,
    evidencePipeline.impactByKey
  );

  const { ledger, overview } = await runTimed(runId, "build_vote_ledger", () =>
    buildVoteLedgerUpdate(config, membersIndex, null, fetchConfig, {
      discovery,
      now,
      menuVotes: menuVotes ?? undefined,
    })
  );
  const newVoteNumbers = diffVoteNumbers(ledger, null);

  const allErrors = [...memberResult.errors, ...evidencePipeline.errors];
  const coverage = summarizeCoverage(
    runId,
    evidencePipeline.processedBillCount,
    evidencePipeline.endpointSuccessRates,
    evidencePipeline.endpointFallbackRates,
    evidencePipeline.structuredAmountCount,
    evidencePipeline.recipientCount,
    evidencePipeline.stateSignalCount,
    allErrors.length > 0,
    allErrors
  );

  const materializeJob: PipelineJob = {
    type: "materialize_read_models",
    created_at: new Date().toISOString(),
    reason: "scheduled_ingestion_complete",
  };
  const queued = await runTimed(runId, "queue_materialization", () =>
    enqueuePipelineJob(env, materializeJob)
  );
  if (!queued) {
    await runTimed(runId, "materialize_read_models_inline", async () =>
      materializeReadModels(env, ledger, overview, effectiveActivityIndex)
    );
  }

  logEvent("scheduled_ingestion_complete", {
    run_id: runId,
    duration_ms: Date.now() - startTime,
    target_state: config.targetState,
    new_vote_count: newVoteNumbers.length,
    new_vote_numbers: newVoteNumbers,
    bills_processed: coverage.bills_processed,
    partial: coverage.partial,
  });
}

export function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
  runtime: Runtime = buildRuntime(env)
): void {
  logEvent("scheduled_trigger", {
    scheduled_for: new Date(controller.scheduledTime).toISOString(),
  });

  ctx.waitUntil(
    runScheduledIngestion(env, runtime).catch((err) => {
      logEvent("scheduled_ingestion_failed", {
        fatal: true,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    })
  );
}
