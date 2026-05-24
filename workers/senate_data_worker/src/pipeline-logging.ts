import type { FetchConfig } from "./fetch";
import { computePct } from "./pipeline-runtime-config";
import type { CoverageSnapshot, EvidenceEndpoint, SourceError, VoteLedger } from "./types";

export type JsonResponseBuilder = (body: unknown, init?: ResponseInit) => Response;

export const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";

export const buildJsonResponse = (body: unknown, corsHeaders: HeadersInit, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });

export const PIPELINE_FETCH_CONFIG: FetchConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 15_000,
  concurrency: 2,
  maxDelayMs: 30_000,
};

export const HISTORICAL_BACKFILL_BATCH_SIZE = 20;

export function makeRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hashRunId(runId: string): number {
  let hash = 0;
  for (let i = 0; i < runId.length; i++) {
    hash = (hash << 5) - hash + runId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

export function logEvent(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...payload }));
}

export async function runTimed<T>(
  runId: string,
  phase: string,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    logEvent("phase_complete", {
      run_id: runId,
      phase,
      duration_ms: Date.now() - started,
      success: true,
    });
    return result;
  } catch (error) {
    logEvent("phase_complete", {
      run_id: runId,
      phase,
      duration_ms: Date.now() - started,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function summarizeCoverage(
  runId: string,
  billCount: number,
  claimCoveragePct: number,
  benefitMapCoveragePct: number,
  likelyReasonCoveragePct: number,
  quoteValidityPct: number,
  confidenceMismatchPct: number,
  endpointSuccessRates: Partial<Record<EvidenceEndpoint, number>>,
  endpointFallbackRates: Partial<Record<EvidenceEndpoint, number>>,
  structuredAmountCount: number,
  recipientCount: number,
  stateSignalCount: number,
  partial: boolean,
  errors: SourceError[]
): CoverageSnapshot {
  return {
    generated_at: new Date().toISOString(),
    run_id: runId,
    bills_processed: billCount,
    bills_with_structured_amount: structuredAmountCount,
    bills_with_recipient: recipientCount,
    bills_with_state_signal: stateSignalCount,
    pct_with_structured_amount: computePct(structuredAmountCount, billCount),
    pct_with_recipient: computePct(recipientCount, billCount),
    pct_with_state_signal: computePct(stateSignalCount, billCount),
    pct_claims_with_evidence_refs: claimCoveragePct,
    pct_benefit_map_with_evidence_refs: benefitMapCoveragePct,
    pct_likely_reasons_with_evidence_refs: likelyReasonCoveragePct,
    pct_quote_validity: quoteValidityPct,
    pct_confidence_calibration_mismatch: confidenceMismatchPct,
    endpoint_success_rates: endpointSuccessRates,
    endpoint_fallback_rates: endpointFallbackRates,
    partial,
    errors,
  };
}

export function diffVoteNumbers(current: VoteLedger, previous: VoteLedger | null): number[] {
  const previousNumbers = new Set((previous?.entries ?? []).map((entry) => entry.vote_number));
  return current.entries
    .map((entry) => entry.vote_number)
    .filter((voteNumber) => !previousNumbers.has(voteNumber));
}
