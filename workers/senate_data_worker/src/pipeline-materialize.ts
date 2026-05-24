import { buildBillKey } from "./congress";
import { harvestBillEvidence, EVIDENCE_ENDPOINT_TIERS } from "./bill-evidence";
import { buildTrendSnapshot, extractBillImpactEvidence } from "./impact-extract";
import {
  analyzeBillsWithCache,
  type AnalyzeBillsResult,
} from "./openrouter";
import { mapWithConcurrency } from "./concurrency";
import { buildPipelineMaterialization, buildVoteDetailResponse } from "./read-model";
import { writePlatformMaterializationToD1 } from "./d1";
import type { PipelineMaterialization } from "./platform-types";
import {
  buildLatestChamberContextKey,
  buildLatestBriefingKey,
  buildMemberKeys,
  buildMembersIndexKey,
  buildActivitiesIndexKey,
  buildVoteLedgerKey,
  buildVoteDetailKey,
  buildSessionOverviewKey,
  buildBillEvidenceKey,
  buildBillTrendSnapshotKey,
  publishToR2,
  readJsonFromR2,
  writeJsonToR2IfChanged,
  buildChamberContextKey,
} from "./storage";
import { computePct } from "./pipeline-runtime-config";
import { logEvent } from "./pipeline-logging";
import type { PipelineEnv } from "./pipeline-env";
import type {
  SnapshotJson,
  MetaJson,
  MemberActivityJson,
  MemberIndexJson,
  ActivityIndexJson,
  VoteLedger,
  SessionOverview,
  BillRef,
  BillImpactEvidence,
  BillEvidenceRecord,
  EvidenceEndpoint,
  MemberActivityContext,
  SourceError,
} from "./types";

export interface QualityGateConfig {
  minClaimsCoveragePct: number;
  minQuoteValidityPct: number;
  maxConfidenceMismatchPct: number;
  hardGates: boolean;
}

export interface BillEvidencePipelineResult {
  processedBillCount: number;
  impactByKey: Map<string, BillImpactEvidence>;
  billInputs: Array<{ bill: BillRef; impactEvidence?: BillImpactEvidence }>;
  endpointSuccessRates: Partial<Record<EvidenceEndpoint, number>>;
  endpointFallbackRates: Partial<Record<EvidenceEndpoint, number>>;
  structuredAmountCount: number;
  recipientCount: number;
  stateSignalCount: number;
  errors: SourceError[];
}

export interface BillEvidencePipelineOptions {
  runId: string;
  congressApiKey: string;
  session: number;
  maxBills: number;
  billConcurrency: number;
  endpointFanout: number;
}

export async function publishChamberContext(
  bucket: R2Bucket,
  windowEnd: string,
  context: MemberActivityContext
): Promise<void> {
  await writeJsonToR2IfChanged(bucket, buildChamberContextKey(windowEnd), context);
  await writeJsonToR2IfChanged(bucket, buildLatestChamberContextKey(), context);
}

export async function readLatestChamberContext(bucket: R2Bucket): Promise<MemberActivityContext | null> {
  return readJsonFromR2<MemberActivityContext>(bucket, buildLatestChamberContextKey());
}

export async function hasPublishedReadModels(bucket: R2Bucket): Promise<boolean> {
  const [ledger, overview, briefing] = await Promise.all([
    readJsonFromR2<VoteLedger>(bucket, buildVoteLedgerKey()),
    readJsonFromR2<SessionOverview>(bucket, buildSessionOverviewKey()),
    readJsonFromR2<unknown>(bucket, buildLatestBriefingKey()),
  ]);
  return Boolean(ledger && overview && briefing);
}

export async function publishMemberActivity(
  bucket: R2Bucket,
  membersIndex: MemberIndexJson,
  memberActivities: MemberActivityJson[],
  windowEnd: string,
  activityIndex: ActivityIndexJson | null
): Promise<void> {
  console.log("[r2] Publishing member activity...");

  await writeJsonToR2IfChanged(bucket, buildMembersIndexKey(), membersIndex);
  if (activityIndex) {
    await writeJsonToR2IfChanged(bucket, buildActivitiesIndexKey(), activityIndex);
  }

  await mapWithConcurrency(memberActivities, 3, async (activity) => {
    const keys = buildMemberKeys(activity.member.bioguide_id, windowEnd);
    await writeJsonToR2IfChanged(bucket, keys.snapshot, activity);
    await writeJsonToR2IfChanged(bucket, keys.latest, activity);
  });

  console.log("[r2] Member activity publish complete");
}

export function canBuildBillKey(bill: BillRef | undefined): bill is BillRef {
  return Boolean(
    bill &&
    typeof bill.congress === "number" &&
    typeof bill.type === "string" &&
    bill.type.trim() &&
    typeof bill.number === "string" &&
    bill.number.trim()
  );
}

export function collectUniqueBills(
  memberActivities: MemberActivityJson[],
  activityIndex: ActivityIndexJson | null
): Map<string, BillRef> {
  const byKey = new Map<string, BillRef>();
  for (const memberActivity of memberActivities) {
    for (const item of memberActivity.activities) {
      if ((item.type === "legislation_action" || item.type === "roll_call_vote") && item.bill) {
        const key = buildBillKey(item.bill);
        if (!byKey.has(key)) byKey.set(key, item.bill);
      }
    }
  }
  for (const activity of activityIndex?.activities ?? []) {
    if (!activity.bill) continue;
    const key = buildBillKey(activity.bill);
    if (!byKey.has(key)) byKey.set(key, activity.bill);
  }
  return byKey;
}

export function attachImpactEvidenceToBill(
  bill: BillRef | undefined,
  impactByKey: ReadonlyMap<string, BillImpactEvidence>
): void {
  if (!canBuildBillKey(bill)) return;
  const key = buildBillKey(bill);
  const impact = impactByKey.get(key);
  if (impact) bill.impact_evidence = impact;
}

export function attachAnalysisToBill(
  bill: BillRef | undefined,
  analysisByKey: ReadonlyMap<string, NonNullable<BillRef["analysis"]>>
): void {
  if (!canBuildBillKey(bill)) return;
  const key = buildBillKey(bill);
  const analysis = analysisByKey.get(key);
  if (analysis) bill.analysis = analysis;
}

export function evaluateQualityGates(
  result: AnalyzeBillsResult,
  config: QualityGateConfig
): string[] {
  const failures: string[] = [];
  if (result.claimsWithEvidenceRefPct < config.minClaimsCoveragePct) {
    failures.push(
      `claims coverage ${result.claimsWithEvidenceRefPct}% < ${config.minClaimsCoveragePct}%`
    );
  }
  if (result.quoteValidityPct < config.minQuoteValidityPct) {
    failures.push(
      `quote validity ${result.quoteValidityPct}% < ${config.minQuoteValidityPct}%`
    );
  }
  if (result.confidenceCalibrationMismatchPct > config.maxConfidenceMismatchPct) {
    failures.push(
      `confidence mismatch ${result.confidenceCalibrationMismatchPct}% > ${config.maxConfidenceMismatchPct}%`
    );
  }
  return failures;
}

export async function buildBillEvidencePipeline(
  bucket: R2Bucket,
  billsByKey: Map<string, BillRef>,
  options: BillEvidencePipelineOptions
): Promise<BillEvidencePipelineResult> {
  const entries = Array.from(billsByKey.entries()).slice(0, options.maxBills);
  const endpointStats: Record<EvidenceEndpoint, { ok: number; total: number }> = {
    detail: { ok: 0, total: 0 },
    summaries: { ok: 0, total: 0 },
    subjects: { ok: 0, total: 0 },
    committees: { ok: 0, total: 0 },
    text: { ok: 0, total: 0 },
    actions: { ok: 0, total: 0 },
    amendments: { ok: 0, total: 0 },
    cbo_cost_estimates: { ok: 0, total: 0 },
    committee_reports: { ok: 0, total: 0 },
    related_bills: { ok: 0, total: 0 },
    cosponsors: { ok: 0, total: 0 },
  };
  const endpointFallbackStats: Record<EvidenceEndpoint, { fallback: number; total: number }> = {
    detail: { fallback: 0, total: 0 },
    summaries: { fallback: 0, total: 0 },
    subjects: { fallback: 0, total: 0 },
    committees: { fallback: 0, total: 0 },
    text: { fallback: 0, total: 0 },
    actions: { fallback: 0, total: 0 },
    amendments: { fallback: 0, total: 0 },
    cbo_cost_estimates: { fallback: 0, total: 0 },
    committee_reports: { fallback: 0, total: 0 },
    related_bills: { fallback: 0, total: 0 },
    cosponsors: { fallback: 0, total: 0 },
  };
  const errors: SourceError[] = [];
  const impactByKey = new Map<string, BillImpactEvidence>();
  const billInputs: Array<{ bill: BillRef; impactEvidence?: BillImpactEvidence }> = [];

  const fetchConfig = {
    maxRetries: 3,
    baseDelayMs: 800,
    timeoutMs: 15_000,
    concurrency: options.endpointFanout,
  };

  await mapWithConcurrency(entries, options.billConcurrency, async ([key, bill]) => {
    const harvested = await harvestBillEvidence(bill, options.congressApiKey, {
      endpointFanout: options.endpointFanout,
      fetchConfig,
    });
    if (harvested.error) {
      errors.push({
        source: "congress",
        message: `Evidence harvest issue for ${key}: ${harvested.error}`,
      });
    }
    for (const endpoint of Object.keys(EVIDENCE_ENDPOINT_TIERS) as EvidenceEndpoint[]) {
      const status = harvested.evidence.endpoints[endpoint];
      if (!status) continue;
      endpointStats[endpoint].total += 1;
      if (status.ok) endpointStats[endpoint].ok += 1;
      endpointFallbackStats[endpoint].total += 1;
      if (status.fallback_used) endpointFallbackStats[endpoint].fallback += 1;
    }

    const impact = extractBillImpactEvidence(bill, harvested.evidence, {
      session: options.session,
    });
    const snapshotDate = impact.generated_at.slice(0, 10);
    const trendSnapshot = buildTrendSnapshot(bill, impact, snapshotDate);
    const record: BillEvidenceRecord = {
      schema_version: 1,
      generated_at: impact.generated_at,
      raw: harvested.evidence,
      impact,
    };
    await writeJsonToR2IfChanged(bucket, buildBillEvidenceKey(key), record);
    await writeJsonToR2IfChanged(
      bucket,
      buildBillTrendSnapshotKey(bill.congress, key, snapshotDate),
      trendSnapshot
    );
    impactByKey.set(key, impact);
    billInputs.push({ bill, impactEvidence: impact });
  });

  const endpointSuccessRates: Partial<Record<EvidenceEndpoint, number>> = {};
  const endpointFallbackRates: Partial<Record<EvidenceEndpoint, number>> = {};
  for (const [endpoint, stats] of Object.entries(endpointStats) as Array<
    [EvidenceEndpoint, { ok: number; total: number }]
  >) {
    endpointSuccessRates[endpoint] = computePct(stats.ok, stats.total);
    const fallbackStats = endpointFallbackStats[endpoint];
    endpointFallbackRates[endpoint] = computePct(fallbackStats.fallback, fallbackStats.total);
  }

  let structuredAmountCount = 0;
  let recipientCount = 0;
  let stateSignalCount = 0;
  for (const impact of impactByKey.values()) {
    if (impact.how_much.length > 0) structuredAmountCount++;
    if (impact.who.length > 0) recipientCount++;
    if (
      impact.where.states_mentioned.length > 0 ||
      impact.where.geography_scope === "state-formula"
    ) {
      stateSignalCount++;
    }
  }

  logEvent("bill_evidence_pipeline_complete", {
    run_id: options.runId,
    processed_bills: entries.length,
    structured_amount_count: structuredAmountCount,
    recipient_count: recipientCount,
    state_signal_count: stateSignalCount,
  });

  return {
    processedBillCount: entries.length,
    impactByKey,
    billInputs,
    endpointSuccessRates,
    endpointFallbackRates,
    structuredAmountCount,
    recipientCount,
    stateSignalCount,
    errors,
  };
}

export async function enrichBillAnalyses(
  bucket: R2Bucket,
  billInputs: Array<{ bill: BillRef; impactEvidence?: BillImpactEvidence }>,
  memberActivities: MemberActivityJson[],
  activityIndex: ActivityIndexJson | null,
  apiKey: string,
  models: string[],
  maxNewAnalyses: number,
  shadowMode: boolean,
  qualityGateConfig: QualityGateConfig,
  appReferer?: string,
  appTitle?: string
): Promise<AnalyzeBillsResult | null> {
  if (billInputs.length === 0) {
    console.log("[openrouter] No bill refs found for analysis enrichment");
    return null;
  }

  const result = await analyzeBillsWithCache(bucket, billInputs, {
    apiKey,
    models,
    maxNewAnalyses,
    appReferer,
    appTitle,
    timeoutMs: 30_000,
    maxRetries: 2,
    analysisConcurrency: 2,
  });
  const modelSuccessCount = Math.max(0, result.analyzedCount - result.fallbackCount);

  console.log(
    `[openrouter] Analysis enrichment complete: cache hits=${result.cacheHitCount}, saved=${result.analyzedCount}, model-success=${modelSuccessCount}, fallback=${result.fallbackCount}, deferred=${result.deferredCount}, input-skipped=${result.inputSkipCount}, claim-coverage=${result.claimsWithEvidenceRefPct}%, benefit-map-coverage=${result.benefitMapWithEvidenceRefPct}%, likely-reason-coverage=${result.likelyReasonsWithEvidenceRefPct}%, quote-validity=${result.quoteValidityPct}%, confidence-mismatch=${result.confidenceCalibrationMismatchPct}%`
  );
  if (result.deferredCount > 0) {
    console.log(
      `[openrouter] ${result.deferredCount} analyses deferred by maxNewAnalyses limit; refresh will continue across scheduled runs.`
    );
  }
  if (result.fallbackCount > 0) {
    console.log(
      `[openrouter] ${result.fallbackCount} analyses fell back to deterministic summaries after model output or parse failures.`
    );
  }
  if (result.inputSkipCount > 0) {
    console.log(
      `[openrouter] ${result.inputSkipCount} analyses were skipped because the bill lacked enough title or summary text.`
    );
  }
  const gateFailures = evaluateQualityGates(result, qualityGateConfig);
  if (gateFailures.length > 0) {
    logEvent("analysis_quality_gate_failed", {
      failures: gateFailures,
      hard_gates: qualityGateConfig.hardGates,
      claims_coverage_pct: result.claimsWithEvidenceRefPct,
      quote_validity_pct: result.quoteValidityPct,
      confidence_mismatch_pct: result.confidenceCalibrationMismatchPct,
    });
    if (qualityGateConfig.hardGates) {
      throw new Error(`Analysis quality gates failed: ${gateFailures.join("; ")}`);
    }
  }

  if (shadowMode) {
    console.log("[openrouter] Shadow mode active; analysis was generated but not attached to published payloads.");
    return result;
  }

  for (const memberActivity of memberActivities) {
    for (const item of memberActivity.activities) {
      if (item.type !== "legislation_action" && item.type !== "roll_call_vote") continue;
      attachAnalysisToBill(item.bill, result.analysisByKey);
    }
  }

  for (const activity of activityIndex?.activities ?? []) {
    attachAnalysisToBill(activity.bill, result.analysisByKey);
  }
  return result;
}

export async function publishAllStatesToR2(
  bucket: R2Bucket,
  perState: Record<string, { snapshot: SnapshotJson; meta: MetaJson }>
): Promise<void> {
  const entries = Object.entries(perState);
  await mapWithConcurrency(entries, 3, async ([state, payload]) => {
    console.log(`[r2] Publishing ${state} vote data...`);
    await publishToR2(bucket, payload.snapshot, payload.meta);
  });
}

export async function publishReadModelsToR2(
  bucket: R2Bucket,
  materialization: PipelineMaterialization
): Promise<void> {
  await writeJsonToR2IfChanged(bucket, buildLatestBriefingKey(), materialization.briefing);
  await mapWithConcurrency(materialization.voteDetails, 4, async (detail) => {
    await writeJsonToR2IfChanged(
      bucket,
      buildVoteDetailKey(detail.vote.congress, detail.vote.session, detail.vote.vote_number),
      detail
    );
  });
}

export async function materializeReadModels(
  env: PipelineEnv,
  ledger: VoteLedger,
  overview: SessionOverview,
  activityIndex: ActivityIndexJson | null
): Promise<void> {
  const materialization = buildPipelineMaterialization(ledger, overview, activityIndex);
  await publishReadModelsToR2(env.DATA_BUCKET, materialization);
  if (env.SENATE_DB) {
    await writePlatformMaterializationToD1(
      env.SENATE_DB,
      ledger,
      overview,
      activityIndex,
      materialization
    );
  }
}

export { buildVoteDetailResponse };
