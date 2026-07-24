import { describe, expect, it } from "vitest";
import { resetSchemaFlag } from "../d1/schema";
import {
  buildPulseStats,
  CLOSE_VOTE_MAX_ABS_MARGIN,
  isQualifyingCloseVote,
} from "./pulse-stats";

type VoteFixture = {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  bill_type: string;
  bill_number: number;
  yeas: number;
  nays: number;
  vote_date: string;
  is_passage?: number;
  headline?: string | null;
};

function createPulseDb(votes: VoteFixture[]): D1Database {
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("ABS(v.yeas - v.nays) AS margin")) {
          const congress = args[0] as number;
          const session = args[1] as number;
          const chamber = args[2] as string;
          const maxAbs = args[3] as number;
          const limit = args[4] as number;
          const results = votes
            .filter((v) => (v.is_passage ?? 1) === 1)
            .filter((v) => v.congress === congress && v.session === session && v.chamber === chamber)
            .filter((v) => v.yeas + v.nays > 0)
            .map((v) => {
              const margin = Math.abs(v.yeas - v.nays);
              return {
                chamber: v.chamber,
                congress: v.congress,
                session: v.session,
                roll_number: v.roll_number,
                bill_type: v.bill_type,
                bill_number: v.bill_number,
                yeas: v.yeas,
                nays: v.nays,
                margin,
                vote_date: v.vote_date,
                headline: v.headline ?? null,
              };
            })
            .filter((v) => v.margin <= maxAbs && v.margin <= Math.floor((v.yeas + v.nays + 9) / 10))
            .sort((a, b) => a.margin - b.margin || b.vote_date.localeCompare(a.vote_date))
            .slice(0, limit);
          return { results };
        }
        if (sql.includes("policy_area")) {
          return { results: [] };
        }
        return { results: [] };
      },
      first: async () => {
        if (sql.includes("COUNT(*)")) {
          return { count: 0 };
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

describe("isQualifyingCloseVote", () => {
  it("excludes blowout margins like 85–5", () => {
    expect(isQualifyingCloseVote(85, 5)).toBe(false);
  });

  it("includes narrow House margins like 214–212", () => {
    expect(isQualifyingCloseVote(214, 212)).toBe(true);
  });

  it("rejects margins above the absolute cap even when relative % would allow them", () => {
    // 300–270 → margin 30, 10% of 570 is 57; absolute cap is 25.
    expect(isQualifyingCloseVote(300, 270)).toBe(false);
    expect(CLOSE_VOTE_MAX_ABS_MARGIN).toBe(25);
  });
});

describe("buildPulseStats close votes", () => {
  it("returns only qualifying close votes and omits blowouts", async () => {
    resetSchemaFlag();
    const db = createPulseDb([
      {
        chamber: "House",
        congress: 119,
        session: 2,
        roll_number: 10,
        bill_type: "hr",
        bill_number: 100,
        yeas: 214,
        nays: 212,
        vote_date: "2026-06-01",
        headline: "Close House vote",
      },
      {
        chamber: "Senate",
        congress: 119,
        session: 2,
        roll_number: 20,
        bill_type: "hr",
        bill_number: 6644,
        yeas: 85,
        nays: 5,
        vote_date: "2026-06-02",
        headline: "Blowout",
      },
    ]);

    const pulse = await buildPulseStats(db, 119, 2);

    expect(pulse.house.close_votes).toHaveLength(1);
    expect(pulse.house.close_votes[0]).toMatchObject({
      bill_number: 100,
      yeas: 214,
      nays: 212,
      margin: 2,
    });
    expect(pulse.senate.close_votes).toEqual([]);
  });

  it("returns an empty close_votes list when nothing qualifies", async () => {
    resetSchemaFlag();
    const db = createPulseDb([
      {
        chamber: "Senate",
        congress: 119,
        session: 2,
        roll_number: 1,
        bill_type: "s",
        bill_number: 1,
        yeas: 85,
        nays: 5,
        vote_date: "2026-06-02",
      },
      {
        chamber: "House",
        congress: 119,
        session: 2,
        roll_number: 2,
        bill_type: "hr",
        bill_number: 2,
        yeas: 300,
        nays: 100,
        vote_date: "2026-06-03",
      },
    ]);

    const pulse = await buildPulseStats(db, 119, 2);

    expect(pulse.house.close_votes).toEqual([]);
    expect(pulse.senate.close_votes).toEqual([]);
  });
});
