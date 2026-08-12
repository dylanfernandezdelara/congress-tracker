import type {
  CommitteeLeaderboardRow,
  CommitteeLeaderboardSubRow,
  CommitteesLeaderboardResponse,
  StatsChamber,
} from "../../../../shared/stats-api-types";
import { PROCESS_STUCK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  selectCommitteeEventsForCodes,
  selectStandingCommittees,
  selectSubcommitteeRosterByChamber,
} from "../d1/bill-process";
import { lookbackStartIso } from "../sources/congress-client";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function daysBetween(startIso: string, endIso: string): number | null {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function aggregateCommittee(
  systemCode: string,
  name: string,
  events: Array<{
    system_code: string;
    bill_type: string;
    bill_number: number;
    activity_key: string;
    activity_at: string;
  }>,
  asOf: Date,
  stuckSince: string
): Omit<CommitteeLeaderboardRow, "chamber" | "subcommittees"> {
  const byBill = new Map<
    string,
    { sentAt: string | null; advancedAt: string | null; releasedAt: string | null }
  >();

  for (const e of events.filter((x) => x.system_code === systemCode)) {
    const key = `${e.bill_type}:${e.bill_number}`;
    const row = byBill.get(key) ?? {
      sentAt: null,
      advancedAt: null,
      releasedAt: null,
    };
    if (e.activity_key === "sent") {
      if (!row.sentAt || e.activity_at < row.sentAt) row.sentAt = e.activity_at;
    }
    if (e.activity_key === "advanced" || e.activity_key === "worked_on") {
      // Count worked_on as progress but "advanced out" uses advanced/released.
      if (e.activity_key === "advanced") {
        if (!row.advancedAt || e.activity_at < row.advancedAt) row.advancedAt = e.activity_at;
      }
    }
    if (e.activity_key === "released") {
      if (!row.releasedAt || e.activity_at < row.releasedAt) row.releasedAt = e.activity_at;
    }
    byBill.set(key, row);
  }

  let referred = 0;
  let advanced = 0;
  let waiting = 0;
  const lags: number[] = [];

  for (const row of byBill.values()) {
    const left = Boolean(row.advancedAt || row.releasedAt);
    if (row.sentAt || left) referred += 1;
    if (left) {
      advanced += 1;
      if (row.sentAt && row.advancedAt) {
        const d = daysBetween(row.sentAt, row.advancedAt);
        if (d != null) lags.push(d);
      }
    } else if (row.sentAt && row.sentAt <= stuckSince) {
      waiting += 1;
    }
  }

  void asOf;

  return {
    system_code: systemCode,
    name,
    referred,
    advanced,
    waiting,
    advance_rate: referred > 0 ? Math.round((1000 * advanced) / referred) / 1000 : null,
    median_days_to_advance: median(lags),
  };
}

export async function buildCommitteesLeaderboard(
  env: Env,
  congress: number,
  session: number,
  chamber: StatsChamber,
  asOf: string = new Date().toISOString()
): Promise<CommitteesLeaderboardResponse> {
  const standing = await selectStandingCommittees(env.DB, congress, chamber);
  const stuckSince = `${lookbackStartIso(PROCESS_STUCK_DAYS, new Date(asOf))}T00:00:00.000Z`;
  const asOfDate = new Date(asOf);

  const allCodes: string[] = [];
  const allSubs = await selectSubcommitteeRosterByChamber(env.DB, congress, chamber);
  const subsByParent = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    if (!sub.parent_system_code) continue;
    const list = subsByParent.get(sub.parent_system_code) ?? [];
    list.push(sub);
    subsByParent.set(sub.parent_system_code, list);
  }

  for (const c of standing) {
    allCodes.push(c.system_code);
    for (const s of subsByParent.get(c.system_code) ?? []) allCodes.push(s.system_code);
  }

  const events = await selectCommitteeEventsForCodes(env.DB, congress, allCodes);

  const items: CommitteeLeaderboardRow[] = standing.map((c) => {
    const base = aggregateCommittee(c.system_code, c.name, events, asOfDate, stuckSince);
    const subs = subsByParent.get(c.system_code) ?? [];
    const subcommittees: CommitteeLeaderboardSubRow[] = subs.map((s) => {
      const agg = aggregateCommittee(s.system_code, s.name, events, asOfDate, stuckSince);
      return {
        system_code: agg.system_code,
        name: agg.name,
        referred: agg.referred,
        advanced: agg.advanced,
        waiting: agg.waiting,
        advance_rate: agg.advance_rate,
        median_days_to_advance: agg.median_days_to_advance,
      };
    });
    return {
      ...base,
      chamber,
      subcommittees,
    };
  });

  items.sort((a, b) => {
    if (b.waiting !== a.waiting) return b.waiting - a.waiting;
    if (b.referred !== a.referred) return b.referred - a.referred;
    return a.name.localeCompare(b.name);
  });

  return {
    congress,
    session,
    chamber,
    items,
    as_of: asOf,
  };
}
