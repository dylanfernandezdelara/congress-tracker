import { buildBillKey } from "../congress";
import { harvestBillEvidence, EVIDENCE_ENDPOINT_TIERS } from "../bill-evidence";
import { extractBillImpactEvidence } from "../impact-extract";
import { mapWithConcurrency } from "../concurrency";
import { canBuildBillKey } from "../domain/bill-ref";
import { computePct, type Env } from "../config";
import type { FetchConfig } from "../fetch";
import type { FixtureHttp } from "../harness";
import { logEvent } from "./logging";
import type {
  MemberActivityJson,
  ActivityIndexJson,
  VoteLedger,
  SessionOverview,
  BillRef,
  BillImpactEvidence,
  EvidenceEndpoint,
  SourceError,
} from "../types";

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
  fixture?: FixtureHttp;
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

export async function buildBillEvidencePipeline(
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

type MaterializationPrerequisitesInput = {
  ledger: VoteLedger | null;
  overview: SessionOverview | null;
  activityIndex: ActivityIndexJson | null;
};

type MaterializationPrerequisites = {
  ledger: VoteLedger;
  overview: SessionOverview;
  activityIndex: ActivityIndexJson | null;
};

export async function materializeReadModels(
  _env: Env,
  _ledger: VoteLedger,
  _overview: SessionOverview,
  _activityIndex: ActivityIndexJson | null
): Promise<void> {}

export async function readMaterializationPrerequisites(
  _db: D1Database
): Promise<MaterializationPrerequisitesInput> {
  return { ledger: null, overview: null, activityIndex: null };
}

export function hasMaterializationPrerequisites(
  prereqs: MaterializationPrerequisitesInput
): prereqs is MaterializationPrerequisites {
  return prereqs.ledger !== null && prereqs.overview !== null;
}

export async function materializeReadModelsFromStorage(_env: Env): Promise<void> {}
