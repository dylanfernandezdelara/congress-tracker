import type { FetchConfig } from "../fetch";
import { computePct } from "../config";
import type { CoverageSnapshot, EvidenceEndpoint, SourceError, VoteLedger } from "../types";

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
