import {
  PROCESS_MAX_HYDRATIONS_PER_RUN,
  PROCESS_RATELIMIT_STOP_REMAINING,
} from "../constants";
import {
  getCommitteeNameMap,
  markProcessHydrated,
  replaceCommitteeEventsForBill,
  selectProcessQueueBatch,
  upsertProcessState,
  type ProcessBillKey,
} from "../d1/bill-process";
import { deriveProcessState, type CommitteeEventRow } from "../process/derive-state";
import { parseCommitteeEvents } from "../process/parse-committee-source";
import type { Env } from "../config";
import { normalizeBillType } from "../sources/bill-type";
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

export async function hydrateProcessBills(
  env: Env,
  bills: ProcessBillKey[]
): Promise<RefreshBillProcessResult> {
  let refreshed = 0;
  let skipped = 0;
  let stoppedForRateLimit = false;
  const warnings: string[] = [];
  const nameMaps = new Map<number, Map<string, string>>();

  for (const bill of bills) {
    const label = billLabel(bill.billType, bill.billNumber, bill.congress);
    try {
      const source = await fetchBillCommitteesSource(env, {
        congress: bill.congress,
        type: bill.billType,
        number: bill.billNumber,
      });

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

      const events = parseCommitteeEvents({
        congress: bill.congress,
        billType: bill.billType,
        billNumber: bill.billNumber,
        committees: source.committees,
        actions: source.actions,
      });

      await replaceCommitteeEventsForBill(
        env.DB,
        bill.congress,
        bill.billType,
        bill.billNumber,
        events
      );

      let nameByCode = nameMaps.get(bill.congress);
      if (!nameByCode) {
        nameByCode = await getCommitteeNameMap(env.DB, bill.congress);
        nameMaps.set(bill.congress, nameByCode);
      }
      // Prefer names from events themselves when roster is sparse.
      for (const e of events) {
        if (!nameByCode.has(e.systemCode)) nameByCode.set(e.systemCode, e.committeeName);
      }

      const eventRows: CommitteeEventRow[] = events.map((e) => ({
        congress: e.congress,
        bill_type: normalizeBillType(e.billType),
        bill_number: e.billNumber,
        system_code: e.systemCode,
        activity_key: e.activityKey,
        activity_at: e.activityAt,
        chamber: e.chamber,
        committee_name: e.committeeName,
        parent_system_code: e.parentSystemCode,
        activity_raw: e.activityRaw,
        tally_text: e.tallyText,
      }));
      const derived = deriveProcessState(bill.billType, eventRows, nameByCode);

      await upsertProcessState(env.DB, {
        congress: bill.congress,
        billType: bill.billType,
        billNumber: bill.billNumber,
        originChamber: derived.origin_chamber,
        currentStatus: derived.current_status,
        currentLabel: derived.current_label,
        lastAdvanceAt: derived.last_advance_at,
      });
      await markProcessHydrated(env.DB, bill);
      refreshed += 1;
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
      // Still mark hydrated so a permanent 404 cannot block the queue forever.
      try {
        await markProcessHydrated(env.DB, bill);
      } catch {
        // ignore
      }
    }
  }

  return { refreshed, skipped, stoppedForRateLimit, warnings };
}
