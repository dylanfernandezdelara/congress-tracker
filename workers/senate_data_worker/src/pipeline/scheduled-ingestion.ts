import type { PipelineJob } from "../platform-types";
import type { Env } from "../config";
import type { FetchConfig } from "../fetch";
import { buildRuntime, type Runtime } from "../runtime";
import type { VoteLedger } from "../types";
import {
  diffVoteNumbers,
  logEvent,
  makeRunId,
  PIPELINE_FETCH_CONFIG,
  runTimed,
  summarizeCoverage,
} from "./logging";
import { materializeReadModels } from "./materialize";
import { enqueuePipelineJob } from "./jobs";
import { readDocumentJson } from "../storage/documents";
import { buildVoteLedgerKey, hasPublishedReadModels } from "../storage";
import {
  collectUniqueBills,
  stageAttachEvidenceToActivities,
  stageBuildVoteLedger,
  stageDiscoverVoteUpdates,
  stageFetchVoteMenu,
  stageHarvestEvidence,
  stageIngestMembers,
  stagePublishMemberCore,
  stagePublishVoteLedger,
  stageResolveActivityIndex,
} from "./ingestion-stages";

/**
 * Core ingestion logic, separated for use with ctx.waitUntil.
 * Sequences explicit stages; the Senate vote menu is fetched once per run.
 */
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

  const existingLedger = await readDocumentJson<VoteLedger>(env.SENATE_DB, buildVoteLedgerKey());

  const menuVotes = await runTimed(runId, "fetch_vote_menu", () =>
    stageFetchVoteMenu(config.congress, config.session, fetchConfig)
  );

  const discovery = await runTimed(runId, "discover_vote_updates", () =>
    stageDiscoverVoteUpdates(config, existingLedger, {
      db: env.SENATE_DB,
      fetchConfig,
      now,
      menuVotes,
    })
  );

  if (discovery.missingVoteNumbers.length === 0 && (await hasPublishedReadModels(env.SENATE_DB))) {
    logEvent("scheduled_ingestion_noop", {
      run_id: runId,
      duration_ms: Date.now() - startTime,
      congress: config.congress,
      session: config.session,
      known_vote_count: discovery.existingVoteNumbers.size,
      eligible_vote_count: discovery.eligibleVotes.length,
      latest_eligible_vote_date: discovery.latestEligibleVoteDate,
      new_vote_count: 0,
    });
    return;
  }

  const memberResult = await runTimed(runId, "member_ingestion", () =>
    stageIngestMembers(config, {
      congressApiKey: config.congressApiKey,
      govInfoApiKey: config.govInfoApiKey,
      now,
      fixture: runtime.fixtureHttp,
      menuVotes,
      fetchConfig,
    })
  );

  if (!memberResult.success || !memberResult.membersIndex) {
    throw new Error(`[scheduled] Member ingestion failed: ${memberResult.error ?? "unknown error"}`);
  }
  const membersIndex = memberResult.membersIndex;

  const effectiveActivityIndex = await stageResolveActivityIndex(env.SENATE_DB, memberResult);
  if (
    (memberResult.activityIndex?.activities?.length ?? 0) === 0 &&
    effectiveActivityIndex?.activities?.length
  ) {
    logEvent("activity_index_fallback_reused", {
      run_id: runId,
      previous_generated_at: effectiveActivityIndex.generated_at,
      previous_count: effectiveActivityIndex.activities.length,
    });
  }

  const billsByKey = collectUniqueBills(memberResult.memberActivities, effectiveActivityIndex);
  const evidencePipeline = await runTimed(runId, "bill_evidence_pipeline", () =>
    stageHarvestEvidence(env.SENATE_DB, billsByKey, {
      runId,
      congressApiKey: config.congressApiKey,
      session: config.session,
      maxBills: config.evidence.maxBills,
      billConcurrency: config.evidence.billConcurrency,
      endpointFanout: config.evidence.endpointFanout,
      fixture: runtime.fixtureHttp,
    })
  );

  stageAttachEvidenceToActivities(
    memberResult.memberActivities,
    effectiveActivityIndex,
    evidencePipeline.impactByKey
  );

  await runTimed(runId, "publish_member_activity_core", () =>
    stagePublishMemberCore(env.SENATE_DB, membersIndex, memberResult, effectiveActivityIndex)
  );

  const { ledger, overview } = await runTimed(runId, "build_vote_ledger", () =>
    stageBuildVoteLedger(config, membersIndex, existingLedger, fetchConfig, {
      db: env.SENATE_DB,
      discovery,
      now,
      menuVotes,
    })
  );
  const newVoteNumbers = diffVoteNumbers(ledger, existingLedger);

  await runTimed(runId, "publish_vote_ledger", () =>
    stagePublishVoteLedger(env.SENATE_DB, ledger, overview)
  );

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

/**
 * Scheduled handler for cron triggers.
 */
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
