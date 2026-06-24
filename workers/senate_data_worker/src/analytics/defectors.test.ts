import { describe, expect, it } from "vitest";
import { computeDefectors, computeRollDefectors } from "../analytics/defectors";
import { resetSchemaFlag } from "../d1/schema";

function createTestDb(): D1Database {
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM member_votes mv")) {
          return {
            results: [
              {
                bioguide_id: "A001",
                position: "Nay",
                chamber: "Senate",
                congress: 119,
                session: 2,
                roll_number: 1,
                yeas: 51,
                nays: 49,
                bill_type: "s",
                bill_number: 1,
                bill_congress: 119,
              },
              {
                bioguide_id: "A002",
                position: "Yea",
                chamber: "Senate",
                congress: 119,
                session: 2,
                roll_number: 1,
                yeas: 51,
                nays: 49,
                bill_type: "s",
                bill_number: 1,
                bill_congress: 119,
              },
              {
                bioguide_id: "A003",
                position: "Yea",
                chamber: "Senate",
                congress: 119,
                session: 2,
                roll_number: 1,
                yeas: 51,
                nays: 49,
                bill_type: "s",
                bill_number: 1,
                bill_congress: 119,
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
  it("ranks members who cross party majority on close votes", async () => {
    resetSchemaFlag();
    const db = createTestDb();
    const defectors = await computeDefectors(db, 119, 2, "Senate", 5);
    expect(defectors.length).toBeGreaterThan(0);
    expect(defectors[0].name).toBe("Alice");
    expect(defectors[0].cross_vote_count).toBe(1);
    expect(defectors[0].deciding_score).toBeGreaterThan(0);
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
    const defectors = await computeRollDefectors(db, {
      chamber: "Senate",
      congress: 119,
      session: 2,
      roll_number: 1,
    });

    expect(defectors).toHaveLength(1);
    expect(defectors[0]).toMatchObject({
      name: "Alice",
      position: "nay",
      party_line: "yea",
    });
  });
});
