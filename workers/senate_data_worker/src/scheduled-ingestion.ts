import { buildVoteLedgerUpdate, discoverVoteLedgerUpdates } from "./ingest";
import { runMemberIngestion } from "./member-ingest";
import { getHarnessRuntime } from "./harness";
import { DEFAULT_OPENROUTER_MODELS, type AnalyzeBillsResult } from "./openrouter";
import { readDocumentJson, writeDocumentJson } from "./d1/documents";
import {
  buildActivitiesIndexKey,
  buildSessionOverviewKey,
  buildVoteLedgerKey,
} from "./storage";
import type { PipelineJob } from "./platform-types";
import type { PipelineEnv } from "./pipeline-env";
import type { ActivityIndexJson, SourceError, VoteLedger } from "./types";
import {
  parseBool,
  parseCsvList,
  parseIntSafe,
  parsePct,
  validateEnv,
} from "./pipeline-runtime-config";
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
export async function runScheduledIngestion(env: PipelineEnv): Promise<void> {
  const runId = makeRunId();
  const startTime = Date.now();
  logEvent("scheduled_ingestion_start", {
    run_id: runId,
    timestamp: new Date().toISOString(),
  });

  const config = validateEnv(env);
  const congressApiKey = env.CONGRESS_API_KEY || config.congressApiKey;
  const govInfoApiKey = env.GOVINFO_API_KEY || "HARNESS_FIXTURE_KEY";
  const evidenceMaxBills = Math.max(5, parseIntSafe(env.EVIDENCE_MAX_BILLS, 30));
  const evidenceBillConcurrency = Math.max(
    1,
    Math.min(parseIntSafe(env.EVIDENCE_BILL_CONCURRENCY, 2), 3)
  );
  const evidenceEndpointFanout = Math.max(
    1,
    Math.min(parseIntSafe(env.EVIDENCE_ENDPOINT_FANOUT, 3), 4)
  );
  const activityLookbackDays = Math.max(7, Math.min(parseIntSafe(env.ACTIVITY_LOOKBACK_DAYS, 30), 120));

  const existingLedger = await readDocumentJson<VoteLedger>(env.SENATE_DB, buildVoteLedgerKey());
  const discovery = await runTimed(runId, "discover_vote_updates", async () =>
    discoverVoteLedgerUpdates(config, existingLedger, {
      db: env.SENATE_DB,
      fetchConfig: PIPELINE_FETCH_CONFIG,
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
      lookbackDays: activityLookbackDays,
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
      maxBills: evidenceMaxBills,
      billConcurrency: evidenceBillConcurrency,
      endpointFanout: evidenceEndpointFanout,
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

  const harnessRuntime = getHarnessRuntime();
  const fixtureMode = harnessRuntime.mode === "fixture";
  const shadowMode = fixtureMode ? true : parseBool(env.OPENROUTER_SHADOW_MODE, false);
  const canaryPercent = Math.max(0, Math.min(parseIntSafe(env.OPENROUTER_CANARY_PERCENT, 100), 100));
  const canaryValue = hashRunId(runId);
  const canaryEnabled = canaryValue < canaryPercent;
  const maxNewAnalyses = Math.max(1, parseIntSafe(env.OPENROUTER_MAX_NEW_ANALYSES, 20));
  const openrouterAppReferer = env.OPENROUTER_APP_REFERER?.trim();
  const openrouterAppTitle = env.OPENROUTER_APP_TITLE?.trim() || "congress_tracker_worker";
  const qualityGateConfig: QualityGateConfig = {
    minClaimsCoveragePct: parsePct(env.QUALITY_MIN_CLAIMS_COVERAGE, 70),
    minQuoteValidityPct: parsePct(env.QUALITY_MIN_QUOTE_VALIDITY, 80),
    maxConfidenceMismatchPct: parsePct(env.QUALITY_MAX_CONFIDENCE_MISMATCH, 35),
    hardGates: parseBool(env.QUALITY_HARD_GATES, false),
  };
  let analysisResult: AnalyzeBillsResult | null = null;
  let synthesisErrors: SourceError[] = [];

  if (!fixtureMode && env.OPENROUTER_API_KEY?.trim() && canaryEnabled) {
    const models = parseCsvList(env.OPENROUTER_MODEL);
    try {
      analysisResult = await runTimed(runId, "openrouter_synthesis", async () =>
        enrichBillAnalyses(
          env.SENATE_DB,
          evidencePipeline.billInputs,
          memberResult.memberActivities,
          effectiveActivityIndex,
          env.OPENROUTER_API_KEY as string,
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
  } else if (!env.OPENROUTER_API_KEY?.trim()) {
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
    buildVoteLedgerUpdate(config, membersIndex, existingLedger, PIPELINE_FETCH_CONFIG, {
      db: env.SENATE_DB,
      discovery,
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
  env: PipelineEnv,
  ctx: ExecutionContext
): void {
  logEvent("scheduled_trigger", {
    scheduled_for: new Date(controller.scheduledTime).toISOString(),
  });

  ctx.waitUntil(
    runScheduledIngestion(env).catch((err) => {
      logEvent("scheduled_ingestion_failed", {
        fatal: true,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    })
  );
}
