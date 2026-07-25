import { describe, expect, it } from "vitest";
import { computeDefectors, computeRollDefectors } from "../analytics/defectors";
import { resetSchemaFlag } from "../d1/schema";

function createTestDb(): D1Database {
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM member_cross_votes")) {
          return {
            results: [
              {
                bioguide_id: "A001",
                chamber: "Senate",
                roll_number: 1,
                bill_type: "s",
                bill_number: 1,
                bill_congress: 119,
                vote_date: "2026-06-01",
                margin: 2,
              },
            ],
          };
        }
        if (sql.includes("FROM members WHERE bioguide_id IN")) {
          const members: Record<string, object> = {
            A001: { bioguide_id: "A001", name: "Alice", chamber: "Senate", party: "D", state: "MA", district: null },
            A002: { bioguide_id: "A002", name: "Bob", chamber: "Senate", party: "D", state: "NY", district: null },
            A003: { bioguide_id: "A003", name: "Dana", chamber: "Senate", party: "D", state: "IL", district: null },
            B001: { bioguide_id: "B001", name: "Carol", chamber: "Senate", party: "R", state: "TX", district: null },
          };
          const results = args
            .map((id) => members[id as string])
            .filter((row): row is object => row !== undefined);
          return { results };
        }
        if (sql.includes("FROM members") && sql.includes("GROUP BY chamber")) {
          return { results: [] };
        }
        return { results: [] };
      },
      first: async () => {
        if (sql.includes("FROM members WHERE")) {
          const id = args[0];
          const members: Record<string, object> = {
            A001: { bioguide_id: "A001", name: "Alice", chamber: "Senate", party: "D", state: "MA", district: null },
            A002: { bioguide_id: "A002", name: "Bob", chamber: "Senate", party: "D", state: "NY", district: null },
            A003: { bioguide_id: "A003", name: "Dana", chamber: "Senate", party: "D", state: "IL", district: null },
            B001: { bioguide_id: "B001", name: "Carol", chamber: "Senate", party: "R", state: "TX", district: null },
          };
          return members[id as string] ?? null;
        }
        return null;
      },
      run: async () => ({ success: true }),
    }),
    run: async () => ({ success: true }),
  });

  return {
    prepare: (sql: string) => stmt(sql),
  } as unknown as D1Database;
}

describe("computeDefectors", () => {
  it("ranks members who cross party majority on close votes from member_cross_votes", async () => {
    resetSchemaFlag();
    const db = createTestDb();
    const defectors = await computeDefectors(db, 119, 2, "Senate", 5);
    expect(defectors.length).toBeGreaterThan(0);
    expect(defectors[0].name).toBe("Alice");
    expect(defectors[0].cross_vote_count).toBe(1);
    expect(defectors[0].deciding_score).toBeGreaterThan(0);
    expect(defectors[0].recent_example).toMatchObject({
      bill_type: "s",
      bill_number: 1,
      congress: 119,
      margin: 2,
    });
  });
});

function createRollTestDb(): D1Database {
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM member_votes") && sql.includes("roll_number = ?")) {
          return {
            results: [
              { bioguide_id: "A001", position: "Nay" },
              { bioguide_id: "A002", position: "Yea" },
              { bioguide_id: "A003", position: "Yea" },
            ],
          };
        }
        if (sql.includes("FROM members WHERE bioguide_id IN")) {
          const members: Record<string, object> = {
            A001: { bioguide_id: "A001", name: "Alice", chamber: "Senate", party: "D", state: "MA", district: null },
            A002: { bioguide_id: "A002", name: "Bob", chamber: "Senate", party: "D", state: "NY", district: null },
            A003: { bioguide_id: "A003", name: "Dana", chamber: "Senate", party: "D", state: "IL", district: null },
          };
          const results = args
            .map((id) => members[id as string])
            .filter((row): row is object => row !== undefined);
          return { results };
        }
        if (sql.includes("FROM members") && sql.includes("GROUP BY chamber")) {
          return { results: [] };
        }
        return { results: [] };
      },
      first: async () => null,
      run: async () => ({ success: true }),
    }),
    run: async () => ({ success: true }),
  });

  return {
    prepare: (sql: string) => stmt(sql),
  } as unknown as D1Database;
}

describe("computeRollDefectors", () => {
  it("returns members who voted against their party on one roll", async () => {
    resetSchemaFlag();
    const db = createRollTestDb();
    const result = await computeRollDefectors(db, {
      chamber: "Senate",
      congress: 119,
      session: 2,
      roll_number: 1,
    });

    expect(result.member_votes_available).toBe(true);
    expect(result.defectors).toHaveLength(1);
    expect(result.defectors[0]).toMatchObject({
      name: "Alice",
      position: "nay",
      party_line: "yea",
    });
  });

  it("counts senators still under an LIS id and drops only seeded rows", async () => {
    resetSchemaFlag();
    const db = createSyncedRosterRollDb();
    const result = await computeRollDefectors(db, {
      chamber: "Senate",
      congress: 119,
      session: 2,
      roll_number: 1,
    });

    // R 1-1, D 1-0, I 1-0 — the LIS senator is present, the LOCAL: seed is not.
    expect(result.party_splits).toEqual([
      { party: "R", yeas: 1, nays: 1, party_line: "yea" },
      { party: "D", yeas: 1, nays: 0, party_line: "yea" },
      { party: "I", yeas: 1, nays: 0, party_line: "yea" },
    ]);
  });
});

/** Roll db whose roster passes hasRealMemberRoster, mixing real, LIS, and seeded ids. */
function createSyncedRosterRollDb(): D1Database {
  const members: Record<string, object> = {
    A001: { bioguide_id: "A001", name: "Alice", chamber: "Senate", party: "D", state: "MA", district: null },
    B001: { bioguide_id: "B001", name: "Carol", chamber: "Senate", party: "R", state: "TX", district: null },
    B002: { bioguide_id: "B002", name: "Erin", chamber: "Senate", party: "R", state: "UT", district: null },
    "LIS:S363": { bioguide_id: "LIS:S363", name: "Angus King", chamber: "Senate", party: "I", state: "ME", district: null },
    "LOCAL:1": { bioguide_id: "LOCAL:1", name: "Sample", chamber: "Senate", party: "D", state: "CA", district: null },
  };

  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM member_votes") && sql.includes("roll_number = ?")) {
          return {
            results: [
              { bioguide_id: "A001", position: "Yea" },
              { bioguide_id: "B001", position: "Yea" },
              { bioguide_id: "B002", position: "Nay" },
              { bioguide_id: "LIS:S363", position: "Yea" },
              { bioguide_id: "LOCAL:1", position: "Nay" },
            ],
          };
        }
        if (sql.includes("FROM members WHERE bioguide_id IN")) {
          return {
            results: args
              .map((id) => members[id as string])
              .filter((row): row is object => row !== undefined),
          };
        }
        if (sql.includes("FROM members") && sql.includes("GROUP BY chamber")) {
          return {
            results: [
              { chamber: "House", seats: 435 },
              { chamber: "Senate", seats: 100 },
            ],
          };
        }
        return { results: [] };
      },
      first: async () => null,
      run: async () => ({ success: true }),
    }),
    run: async () => ({ success: true }),
  });

  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}
