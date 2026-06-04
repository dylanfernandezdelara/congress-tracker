import { buildBillKey } from "../congress";
import { harvestBillEvidence, EVIDENCE_ENDPOINT_TIERS } from "../bill-evidence";
import { buildTrendSnapshot, extractBillImpactEvidence } from "../impact-extract";
import { readDocumentJson, writeDocumentJson } from "../storage/documents";
import { analyzeBillsWithCache } from "../synthesis/client";
import type { AnalyzeBillsResult } from "../synthesis/types-shared";
import {
  evaluateQualityGates,
  type QualityGateConfig,
} from "../synthesis/quality";
import { mapWithConcurrency } from "../concurrency";
import { buildPipelineMaterialization } from "../read-model";
import { writePlatformMaterializationToD1 } from "../d1/materialization";
import type { PipelineMaterialization } from "../platform-types";
import {
  buildLatestChamberContextKey,
  buildMembersIndexKey,
  buildActivitiesIndexKey,
  buildBillEvidenceKey,
  buildBillTrendSnapshotKey,
  buildChamberContextKey,
} from "../storage";
import { computePct, type Env } from "../config";
import type { FetchConfig } from "../fetch";
import type { FixtureHttp } from "../harness";
import { logEvent } from "./logging";
import type {
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
} from "../types";

export type { QualityGateConfig } from "../synthesis/quality";

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
  /** Harness fixture transport applied to every evidence fetch. */
  fixture?: FixtureHttp;
}

export async function publishChamberContext(
  db: D1Database,
  windowEnd: string,
  context: MemberActivityContext
): Promise<void> {
  await writeDocumentJson(db, buildChamberContextKey(windowEnd), context, { skipIfUnchanged: true });
  await writeDocumentJson(db, buildLatestChamberContextKey(), context, { skipIfUnchanged: true });
}

export async function readLatestChamberContext(db: D1Database): Promise<MemberActivityContext | null> {
  return readDocumentJson<MemberActivityContext>(db, buildLatestChamberContextKey());
}

export async function publishMemberActivity(
  db: D1Database,
  membersIndex: MemberIndexJson,
  _memberActivities: MemberActivityJson[],
  _windowEnd: string,
  activityIndex: ActivityIndexJson | null
): Promise<void> {
  console.log("[d1] Publishing member activity documents...");

  await writeDocumentJson(db, buildMembersIndexKey(), membersIndex, { skipIfUnchanged: true });
  if (activityIndex) {
    await writeDocumentJson(db, buildActivitiesIndexKey(), activityIndex, { skipIfUnchanged: true });
  }

  console.log("[d1] Member activity documents publish complete");
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

export { evaluateQualityGates } from "../synthesis/quality";

export async function buildBillEvidencePipeline(
  db: D1Database,
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

  const fetchConfig: FetchConfig = {
    maxRetries: 3,
    baseDelayMs: 800,
    timeoutMs: 15_000,
    concurrency: options.endpointFanout,
    fixture: options.fixture,
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
    await writeDocumentJson(db, buildBillEvidenceKey(key), record, { skipIfUnchanged: true });
    await writeDocumentJson(
      db,
      buildBillTrendSnapshotKey(bill.congress, key, snapshotDate),
      trendSnapshot,
      { skipIfUnchanged: true }
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
  db: D1Database,
  billInputs: Array<{ bill: BillRef; impactEvidence?: BillImpactEvidence }>,
  memberActivities: MemberActivityJson[],
  activityIndex: ActivityIndexJson | null,
  apiKey: string,
  models: string[],
  maxNewAnalyses: number,
  qualityGateConfig: QualityGateConfig,
  appReferer?: string,
  appTitle?: string
): Promise<AnalyzeBillsResult | null> {
  if (billInputs.length === 0) {
    console.log("[openrouter] No bill refs found for analysis enrichment");
    return null;
  }

  const result = await analyzeBillsWithCache(db, billInputs, {
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

export async function materializeReadModels(
  env: Env,
  ledger: VoteLedger,
  overview: SessionOverview,
  activityIndex: ActivityIndexJson | null
): Promise<void> {
  const materialization = buildPipelineMaterialization(ledger, overview, activityIndex);
  await writePlatformMaterializationToD1(
    env.SENATE_DB,
    ledger,
    overview,
    activityIndex,
    materialization
  );
}
