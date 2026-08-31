import {
  PROCESS_MAX_HYDRATIONS_PER_RUN,
  PROCESS_RATELIMIT_STOP_REMAINING,
} from "../constants";
import {
  markProcessHydrated,
  persistBillFloorEvents,
  persistBillProcess,
  selectProcessQueueBatch,
  type ProcessBillKey,
} from "../d1/bill-process";
import { parseCommitteeEvents } from "../process/parse-committee-source";
import { parseFloorActions } from "../process/parse-floor-actions";
import type { Env } from "../config";
import { fetchBillCommitteesSource } from "../sources/congress-client";
import { HttpResponseError } from "../sources/http";
import { billLabel } from "./bill-label";

export interface RefreshBillProcessResult {
  refreshed: number;
  skipped: number;
  stoppedForRateLimit: boolean;
  warnings: string[];
}

export async function refreshBillProcessQueue(
  env: Env,
  opts: { limit?: number } = {}
): Promise<RefreshBillProcessResult> {
  const limit = opts.limit ?? PROCESS_MAX_HYDRATIONS_PER_RUN;
  const bills = await selectProcessQueueBatch(env.DB, limit);
  return hydrateProcessBills(env, bills);
}

function isTerminalMissingBill(err: unknown): boolean {
  return err instanceof HttpResponseError && err.status === 404;
}

export async function hydrateProcessBills(
  env: Env,
  bills: ProcessBillKey[]
): Promise<RefreshBillProcessResult> {
  let refreshed = 0;
  let skipped = 0;
  let stoppedForRateLimit = false;
  const warnings: string[] = [];

  for (const bill of bills) {
    const label = billLabel(bill.billType, bill.billNumber, bill.congress);
    try {
      const source = await fetchBillCommitteesSource(env, {
        congress: bill.congress,
        type: bill.billType,
        number: bill.billNumber,
      });

      const events = parseCommitteeEvents({
        congress: bill.congress,
        billType: bill.billType,
        billNumber: bill.billNumber,
        committees: source.committees,
        actions: source.actions,
      });
      const floorEvents = parseFloorActions({
        congress: bill.congress,
        billType: bill.billType,
        billNumber: bill.billNumber,
        actions: source.actions,
      });

      if (events.length === 0 && floorEvents.length === 0) {
        // Park even when actions exist but nothing classified: otherwise
        // those bills stay last_hydrated_at NULL and starve the backfill budget.
        await markProcessHydrated(env.DB, bill);
        skipped += 1;
        if (source.committees.length > 0) {
          warnings.push(
            `Process hydrate produced no events for ${label}; parked until rehydrate`
          );
        }
      } else {
        if (events.length > 0) {
          await persistBillProcess(env.DB, {
            congress: bill.congress,
            billType: bill.billType,
            billNumber: bill.billNumber,
            events,
          });
        }
        if (floorEvents.length > 0) {
          await persistBillFloorEvents(env.DB, {
            congress: bill.congress,
            billType: bill.billType,
            billNumber: bill.billNumber,
            events: floorEvents,
          });
        }
        await markProcessHydrated(env.DB, bill);
        refreshed += 1;
      }

      // Finish the paid-for hydrate, then stop before the next request.
      if (
        source.rateLimitRemaining != null &&
        source.rateLimitRemaining < PROCESS_RATELIMIT_STOP_REMAINING
      ) {
        stoppedForRateLimit = true;
        warnings.push(
          `Stopping process hydrate early: Congress.gov rate limit remaining=${source.rateLimitRemaining}`
        );
        break;
      }
    } catch (err) {
      if (err instanceof HttpResponseError && err.status === 429) {
        stoppedForRateLimit = true;
        warnings.push(`Congress.gov rate limited while hydrating ${label}`);
        break;
      }
      skipped += 1;
      warnings.push(
        `Process hydrate failed for ${label}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      // Only park permanent misses so transient 5xx/timeouts can retry.
      if (isTerminalMissingBill(err)) {
        try {
          await markProcessHydrated(env.DB, bill);
        } catch {
          // ignore
        }
      }
    }
  }

  return { refreshed, skipped, stoppedForRateLimit, warnings };
}
