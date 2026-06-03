import { buildVoteLedgerUpdate, discoverVoteLedgerUpdates } from "./ingest";
import { runMemberIngestion } from "./member-ingest";
import { DEFAULT_OPENROUTER_MODELS, type AnalyzeBillsResult } from "./openrouter";
import { readDocumentJson, writeDocumentJson } from "./d1/documents";
import {
  buildActivitiesIndexKey,
  buildSessionOverviewKey,
  buildVoteLedgerKey,
} from "./storage";
import type { PipelineJob } from "./platform-types";
import type { Env } from "./config";
import type { FetchConfig } from "./fetch";
import { buildRuntime, type Runtime } from "./runtime";
import type { ActivityIndexJson, SourceError, VoteLedger } from "./types";
import {
  diffVoteNumbers,
  hashRunId,
  logEvent,
  makeRunId,
  PIPELINE_FETCH_CONFIG,
  runTimed,
  summarizeCoverage,
} from "./pipeline-logging";
import {
  attachImpactEvidenceToBill,
  buildBillEvidencePipeline,
  enrichBillAnalyses,
  hasPublishedReadModels,
  materializeReadModels,
  publishChamberContext,
  publishMemberActivity,
  collectUniqueBills,
  type QualityGateConfig,
} from "./pipeline-materialize";
import { enqueuePipelineJob } from "./pipeline-jobs";

/**
 * Core ingestion logic, separated for use with ctx.waitUntil.
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
  const congressApiKey = config.congressApiKey;
  const govInfoApiKey = config.govInfoApiKey;

  const existingLedger = await readDocumentJson<VoteLedger>(env.SENATE_DB, buildVoteLedgerKey());
  const discovery = await runTimed(runId, "discover_vote_updates", async () =>
    discoverVoteLedgerUpdates(config, existingLedger, {
      db: env.SENATE_DB,
      fetchConfig,
      now,
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

  const memberResult = await runTimed(runId, "member_ingestion", async () =>
    runMemberIngestion({
      congress: config.congress,
      session: config.session,
      congressApiKey,
      govInfoApiKey,
      lookbackDays: config.activityLookbackDays,
      now,
      fixture: runtime.fixtureHttp,
    })
  );

  if (!memberResult.success || !memberResult.membersIndex) {
    throw new Error(`[scheduled] Member ingestion failed: ${memberResult.error ?? "unknown error"}`);
  }
  const membersIndex = memberResult.membersIndex;
  const previousActivityIndex = await readDocumentJson<ActivityIndexJson>(
    env.SENATE_DB,
    buildActivitiesIndexKey()
  );
  const effectiveActivityIndex =
    (memberResult.activityIndex?.activities?.length ?? 0) > 0
      ? memberResult.activityIndex
      : previousActivityIndex;
  if ((memberResult.activityIndex?.activities?.length ?? 0) === 0 && previousActivityIndex?.activities?.length) {
    logEvent("activity_index_fallback_reused", {
      run_id: runId,
      previous_generated_at: previousActivityIndex.generated_at,
      previous_count: previousActivityIndex.activities.length,
    });
  }

  const billsByKey = collectUniqueBills(memberResult.memberActivities, effectiveActivityIndex);
  const evidencePipeline = await runTimed(runId, "bill_evidence_pipeline", async () =>
    buildBillEvidencePipeline(env.SENATE_DB, billsByKey, {
      runId,
      congressApiKey,
      session: config.session,
      maxBills: config.evidence.maxBills,
      billConcurrency: config.evidence.billConcurrency,
      endpointFanout: config.evidence.endpointFanout,
      fixture: runtime.fixtureHttp,
    })
  );

  for (const memberActivity of memberResult.memberActivities) {
    for (const item of memberActivity.activities) {
      if (item.type !== "legislation_action" && item.type !== "roll_call_vote") continue;
      attachImpactEvidenceToBill(item.bill, evidencePipeline.impactByKey);
    }
  }
  for (const activity of effectiveActivityIndex?.activities ?? []) {
    attachImpactEvidenceToBill(activity.bill, evidencePipeline.impactByKey);
  }

  await runTimed(runId, "publish_member_activity_core", async () =>
    publishMemberActivity(
      env.SENATE_DB,
      membersIndex,
      memberResult.memberActivities,
      memberResult.windowEnd,
      effectiveActivityIndex
    )
  );
  await runTimed(runId, "publish_chamber_context", async () =>
    publishChamberContext(env.SENATE_DB, memberResult.windowEnd, memberResult.context)
  );

  const fixtureMode = config.fixtureMode;
  const { synthesis, quality } = config;
  const shadowMode = synthesis.shadowMode;
  const canaryPercent = synthesis.canaryPercent;
  const canaryValue = hashRunId(runId);
  const canaryEnabled = canaryValue < canaryPercent;
  const maxNewAnalyses = synthesis.maxNewAnalyses;
  const openrouterAppReferer = synthesis.appReferer;
  const openrouterAppTitle = synthesis.appTitle;
  const qualityGateConfig: QualityGateConfig = {
    minClaimsCoveragePct: quality.minClaimsCoveragePct,
    minQuoteValidityPct: quality.minQuoteValidityPct,
    maxConfidenceMismatchPct: quality.maxConfidenceMismatchPct,
    hardGates: quality.hardGates,
  };
  let analysisResult: AnalyzeBillsResult | null = null;
  let synthesisErrors: SourceError[] = [];

  if (synthesis.enabled && canaryEnabled) {
    const models = synthesis.models;
    try {
      analysisResult = await runTimed(runId, "openrouter_synthesis", async () =>
        enrichBillAnalyses(
          env.SENATE_DB,
          evidencePipeline.billInputs,
          memberResult.memberActivities,
          effectiveActivityIndex,
          synthesis.apiKey as string,
          models.length > 0 ? models : [...DEFAULT_OPENROUTER_MODELS],
          maxNewAnalyses,
          shadowMode,
          qualityGateConfig,
          openrouterAppReferer,
          openrouterAppTitle
        )
      );

      if (analysisResult && !shadowMode) {
        try {
          await runTimed(runId, "publish_member_activity_narrative", async () =>
            publishMemberActivity(
              env.SENATE_DB,
              membersIndex,
              memberResult.memberActivities,
              memberResult.windowEnd,
              effectiveActivityIndex
            )
          );
        } catch (error) {
          synthesisErrors.push({
            source: "congress",
            message: `Narrative publish failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      }
      if (analysisResult) {
        const attemptedAnalyses = analysisResult.analyzedCount + analysisResult.inputSkipCount;
        const fallbackRate =
          attemptedAnalyses > 0 ? analysisResult.fallbackCount / attemptedAnalyses : 0;
        if (fallbackRate > 0.2) {
          logEvent("openrouter_degradation_signal", {
            run_id: runId,
            fallback_rate: Number((fallbackRate * 100).toFixed(2)),
            analyzed_count: analysisResult.analyzedCount,
            fallback_count: analysisResult.fallbackCount,
            deferred_count: analysisResult.deferredCount,
          });
        }
      }
    } catch (error) {
      synthesisErrors.push({
        source: "congress",
        message: `OpenRouter synthesis failed but core publication remains available: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      logEvent("openrouter_synthesis_failed", {
        run_id: runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (fixtureMode) {
    synthesisErrors.push({
      source: "congress",
      message: "Harness fixture mode active; synthesis skipped",
    });
  } else if (!synthesis.apiKey) {
    synthesisErrors.push({
      source: "congress",
      message: "OPENROUTER_API_KEY missing; synthesis skipped",
    });
  } else {
    synthesisErrors.push({
      source: "congress",
      message: `Synthesis skipped due to canary gating (${canaryValue} >= ${canaryPercent})`,
    });
  }

  const { ledger, overview } = await runTimed(runId, "build_vote_ledger", async () =>
    buildVoteLedgerUpdate(config, membersIndex, existingLedger, fetchConfig, {
      db: env.SENATE_DB,
      discovery,
      now,
    })
  );
  const newVoteNumbers = diffVoteNumbers(ledger, existingLedger);

  await runTimed(runId, "publish_vote_ledger", async () =>
    writeDocumentJson(env.SENATE_DB, buildVoteLedgerKey(), ledger, { skipIfUnchanged: true })
  );
  await runTimed(runId, "publish_session_overview", async () =>
    writeDocumentJson(env.SENATE_DB, buildSessionOverviewKey(), overview, { skipIfUnchanged: true })
  );

  const allErrors = [...memberResult.errors, ...evidencePipeline.errors, ...synthesisErrors];
  const coverage = summarizeCoverage(
    runId,
    evidencePipeline.processedBillCount,
    analysisResult?.claimsWithEvidenceRefPct ?? 0,
    analysisResult?.benefitMapWithEvidenceRefPct ?? 0,
    analysisResult?.likelyReasonsWithEvidenceRefPct ?? 0,
    analysisResult?.quoteValidityPct ?? 0,
    analysisResult?.confidenceCalibrationMismatchPct ?? 0,
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
  const queued = await runTimed(runId, "queue_materialization", async () =>
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
    claims_with_evidence_pct: coverage.pct_claims_with_evidence_refs,
    benefit_map_with_evidence_pct: analysisResult?.benefitMapWithEvidenceRefPct ?? 0,
    likely_reasons_with_evidence_pct: analysisResult?.likelyReasonsWithEvidenceRefPct ?? 0,
    quote_validity_pct: analysisResult?.quoteValidityPct ?? 0,
    confidence_mismatch_pct: analysisResult?.confidenceCalibrationMismatchPct ?? 0,
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
