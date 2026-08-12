import { beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, resetSchemaFlag } from "../d1/schema";
import { PROCESS_STUCK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  buildCommitteesLeaderboard,
  waitingInCommitteeForPulse,
} from "./committee-leaderboard";

type StandingRow = {
  congress: number;
  system_code: string;
  chamber: string;
  name: string;
  committee_type: string;
  parent_system_code: string | null;
};

type EventRow = {
  system_code: string;
  bill_type: string;
  bill_number: number;
  activity_key: string;
  activity_at: string;
};

function waitingCount(
  events: EventRow[],
  systemCode: string,
  stuckSince: string
): number {
  const byBill = new Map<string, EventRow[]>();
  for (const event of events) {
    if (event.system_code !== systemCode) continue;
    const key = `${event.bill_type}:${event.bill_number}`;
    const list = byBill.get(key) ?? [];
    list.push(event);
    byBill.set(key, list);
  }
  let waiting = 0;
  for (const billEvents of byBill.values()) {
    const sentAt = billEvents
      .filter((event) => event.activity_key === "sent")
      .map((event) => event.activity_at)
      .sort()[0];
    const advanced = billEvents.some(
      (event) => event.activity_key === "advanced" || event.activity_key === "released"
    );
    if (sentAt && sentAt <= stuckSince && !advanced) waiting += 1;
  }
  return waiting;
}

function createCommitteeDb(standing: StandingRow[], events: EventRow[]): D1Database {
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM committee_roster")) {
          const stuckSince = String(args[1]);
          const congress = args[2] as number;
          const chamber = args[3] as string;
          const rows = standing
            .filter(
              (row) =>
                row.congress === congress &&
                row.chamber === chamber &&
                row.parent_system_code == null &&
                row.committee_type === "Standing"
            )
            .map((row) => ({
              system_code: row.system_code,
              name: row.name,
              waiting: waitingCount(events, row.system_code, stuckSince),
            }))
            .sort(
              (a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name)
            );
          return { results: rows };
        }
        return { results: [] };
      },
      first: async () => {
        if (sql.includes("FROM pipeline_state")) {
          return { value_json: JSON.stringify({ version: SCHEMA_VERSION }) };
        }
        return null;
      },
      run: async () => ({ success: true }),
    }),
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ success: true }),
  });

  return {
    prepare: (sql: string) => stmt(sql),
    exec: async () => ({}),
  } as unknown as D1Database;
}

function createEnv(db: D1Database): Env {
  return { DB: db } as Env;
}

const standingHouse: StandingRow[] = [
  {
    congress: 119,
    system_code: "hsif00",
    chamber: "House",
    name: "Energy and Commerce Committee",
    committee_type: "Standing",
    parent_system_code: null,
  },
  {
    congress: 119,
    system_code: "hsba00",
    chamber: "House",
    name: "Financial Services Committee",
    committee_type: "Standing",
    parent_system_code: null,
  },
];

const waitingEvents: EventRow[] = [
  {
    system_code: "hsif00",
    bill_type: "HR",
    bill_number: 9001,
    activity_key: "sent",
    activity_at: "2026-04-01T12:00:00.000Z",
  },
  {
    system_code: "hsif00",
    bill_type: "HR",
    bill_number: 9002,
    activity_key: "sent",
    activity_at: "2026-03-15T12:00:00.000Z",
  },
  {
    system_code: "hsif00",
    bill_type: "HR",
    bill_number: 1,
    activity_key: "sent",
    activity_at: "2026-03-10T12:00:00.000Z",
  },
  {
    system_code: "hsif00",
    bill_type: "HR",
    bill_number: 1,
    activity_key: "advanced",
    activity_at: "2026-05-14T12:00:00.000Z",
  },
  {
    system_code: "hsba00",
    bill_type: "HR",
    bill_number: 22,
    activity_key: "sent",
    activity_at: "2026-08-01T12:00:00.000Z",
  },
];

describe("buildCommitteesLeaderboard", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("counts standing referrals older than PROCESS_STUCK_DAYS with no advance or release", async () => {
    const asOf = "2026-08-12T00:00:00.000Z";
    const db = createCommitteeDb(standingHouse, waitingEvents);

    const result = await buildCommitteesLeaderboard(createEnv(db), 119, 2, "House", asOf);
    expect(PROCESS_STUCK_DAYS).toBe(90);
    expect(result.items).toEqual([
      {
        system_code: "hsif00",
        name: "Energy and Commerce Committee",
        chamber: "House",
        waiting: 2,
      },
      {
        system_code: "hsba00",
        name: "Financial Services Committee",
        chamber: "House",
        waiting: 0,
      },
    ]);
  });
});

describe("waitingInCommitteeForPulse", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("omits zero-waiting committees and keeps the top five", async () => {
    const asOf = "2026-08-12T00:00:00.000Z";
    const db = createCommitteeDb(standingHouse, waitingEvents);
    const rows = await waitingInCommitteeForPulse(db, 119, "House", asOf);
    expect(rows).toEqual([
      {
        system_code: "hsif00",
        name: "Energy and Commerce Committee",
        chamber: "House",
        waiting: 2,
      },
    ]);
  });
});
