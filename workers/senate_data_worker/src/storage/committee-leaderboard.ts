import type {
  CommitteeLeaderboardRow,
  CommitteesLeaderboardResponse,
  StatsChamber,
} from "../../../../shared/stats-api-types";
import { PROCESS_STUCK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  selectCommitteeEventsForCodes,
  selectStandingCommittees,
} from "../d1/bill-process";
import { lookbackStartIso } from "../sources/congress-client";

type CommitteeEvent = {
  system_code: string;
  bill_type: string;
  bill_number: number;
  activity_key: string;
  activity_at: string;
};

function waitingCount(events: CommitteeEvent[], stuckSince: string): number {
  const byBill = new Map<string, { sentAt: string | null; left: boolean }>();

  for (const e of events) {
    const key = `${e.bill_type}:${e.bill_number}`;
    const row = byBill.get(key) ?? { sentAt: null, left: false };
    if (e.activity_key === "sent") {
      if (!row.sentAt || e.activity_at < row.sentAt) row.sentAt = e.activity_at;
    }
    if (e.activity_key === "advanced" || e.activity_key === "released") {
      row.left = true;
    }
    byBill.set(key, row);
  }

  let waiting = 0;
  for (const row of byBill.values()) {
    if (!row.left && row.sentAt && row.sentAt <= stuckSince) waiting += 1;
  }
  return waiting;
}

function eventsBySystemCode(events: CommitteeEvent[]): Map<string, CommitteeEvent[]> {
  const byCode = new Map<string, CommitteeEvent[]>();
  for (const e of events) {
    const list = byCode.get(e.system_code);
    if (list) list.push(e);
    else byCode.set(e.system_code, [e]);
  }
  return byCode;
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
  const events = await selectCommitteeEventsForCodes(
    env.DB,
    congress,
    standing.map((c) => c.system_code)
  );

  const byCode = eventsBySystemCode(events);
  const items: CommitteeLeaderboardRow[] = standing.map((c) => ({
    system_code: c.system_code,
    name: c.name,
    chamber,
    waiting: waitingCount(byCode.get(c.system_code) ?? [], stuckSince),
  }));

  items.sort((a, b) => {
    if (b.waiting !== a.waiting) return b.waiting - a.waiting;
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
