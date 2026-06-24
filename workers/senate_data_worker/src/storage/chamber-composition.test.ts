import { describe, expect, it } from "vitest";
import { buildChamberComposition } from "./chamber-composition";
import { resetSchemaFlag } from "../d1/schema";

type MockRow = { chamber: string; party: string | null; seats: number };

function createMockDb(options: {
  members?: MockRow[];
  rollCounts?: Array<{
    chamber: string;
    congress: number;
    session: number;
    roll_number: number;
    vote_count: number;
  }>;
  rollRoster?: MockRow[];
}) {
  const { members = [], rollCounts = [], rollRoster = [] } = options;

  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM member_votes mv") && sql.includes("JOIN members")) {
          return { results: rollRoster };
        }
        if (sql.includes("FROM members") && sql.includes("WHERE chamber = ?")) {
          const chamber = args[0] as string;
          return { results: members.filter((row) => row.chamber === chamber) };
        }
        return { results: [] };
      },
      first: async () => {
        if (sql.includes("FROM member_votes") && sql.includes("GROUP BY")) {
          const chamber = args[2] as string;
          const rolls = rollCounts.filter((row) => row.chamber === chamber);
          if (rolls.length === 0) return null;
          return rolls.sort((a, b) => b.vote_count - a.vote_count)[0];
        }
        return null;
      },
    }),
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ success: true }),
  });

  return {
    prepare: (sql: string) => stmt(sql),
  } as unknown as D1Database;
}

describe("buildChamberComposition", () => {
  it("uses the largest member-vote roll when it has a full roster", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      rollCounts: [{ chamber: "House", congress: 119, session: 2, roll_number: 42, vote_count: 435 }],
      rollRoster: [
        { chamber: "House", party: "R", seats: 220 },
        { chamber: "House", party: "D", seats: 215 },
      ],
      members: [{ chamber: "House", party: "D", seats: 3 }],
    });

    const result = await buildChamberComposition(db, 119, 2);

    expect(result.house.total).toBe(435);
    expect(result.house.majority_party).toBe("R");
    expect(result.house.is_sample).toBeUndefined();
    expect(result.house.seats_up_for_election).toBe(435);
    expect(result.house.election_year).toBe(2026);
    expect(result.senate.seats_up_for_election).toBe(33);
    expect(result.senate.election_year).toBe(2026);
  });

  it("marks partial member-table counts as sample data", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      members: [
        { chamber: "House", party: "D", seats: 3 },
        { chamber: "House", party: "R", seats: 1 },
        { chamber: "Senate", party: "R", seats: 2 },
      ],
    });

    const result = await buildChamberComposition(db, 119, 2);

    expect(result.house.total).toBe(4);
    expect(result.house.is_sample).toBe(true);
    expect(result.senate.total).toBe(2);
    expect(result.senate.is_sample).toBe(true);
  });

  it("falls back when roll join undercounts members", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      rollCounts: [{ chamber: "House", congress: 119, session: 2, roll_number: 42, vote_count: 435 }],
      rollRoster: [{ chamber: "House", party: "R", seats: 200 }],
      members: [
        { chamber: "House", party: "R", seats: 220 },
        { chamber: "House", party: "D", seats: 215 },
      ],
    });

    const result = await buildChamberComposition(db, 119, 2);
    expect(result.house.total).toBe(435);
    expect(result.house.is_sample).toBeUndefined();
  });

  it("returns empty composition when no members exist", async () => {
    resetSchemaFlag();
    const db = createMockDb({});
    const result = await buildChamberComposition(db, 119, 2);
    expect(result.house.total).toBe(0);
    expect(result.senate.total).toBe(0);
    expect(result.house.control_label).toBe("No membership data");
  });
});
