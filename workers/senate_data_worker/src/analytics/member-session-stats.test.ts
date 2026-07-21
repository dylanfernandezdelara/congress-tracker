import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSchemaFlag } from "../d1/schema";
import {
  applyRollToMemberSessionStats,
  memberSessionStatsOutOfSync,
  rebuildMemberSessionStats,
} from "./member-session-stats";

type MockRow = Record<string, unknown>;
type BoundStmt = {
  __kind?: "cross" | "stats";
  __row?: MockRow;
  all: () => Promise<{ results: MockRow[] }>;
  first: () => Promise<MockRow | null>;
  run: () => Promise<{ success: boolean; meta: { duration: number } }>;
};

function createDb(options: {
  voteCount?: number;
  statsSum?: number;
  sessionVotes?: MockRow[];
  roster?: MockRow[];
  memberVotePositions?: MockRow[];
  crossCounts?: MockRow[];
}): {
  db: D1Database;
  crossInserts: MockRow[];
  statsUpserts: MockRow[];
} {
  const {
    voteCount = 0,
    statsSum = 0,
    sessionVotes = [],
    roster = [],
    memberVotePositions = [],
    crossCounts = [],
  } = options;
  const crossInserts: MockRow[] = [];
  const statsUpserts: MockRow[] = [];

  const db = {
    exec: vi.fn(async () => {}),
    batch: vi.fn(async (stmts: BoundStmt[]) => {
      for (const stmt of stmts) {
        if (stmt.__kind === "cross" && stmt.__row) crossInserts.push(stmt.__row);
        if (stmt.__kind === "stats" && stmt.__row) statsUpserts.push(stmt.__row);
      }
    }),
    prepare: vi.fn((sql: string) => {
      const bind = (...args: unknown[]): BoundStmt => {
        const bound: BoundStmt = {
          all: vi.fn(async () => {
            if (sql.includes("FROM member_votes mv") && sql.includes("JOIN votes v")) {
              const chamber = String(args[2]);
              return {
                results: sessionVotes.filter((row) => String(row.chamber) === chamber),
              };
            }
            if (sql.includes("FROM members WHERE bioguide_id IN")) {
              const ids = args.map(String);
              return {
                results: roster.filter((row) => ids.includes(String(row.bioguide_id))),
              };
            }
            if (
              sql.includes("FROM member_votes") &&
              sql.includes("bioguide_id IN") &&
              sql.includes("SELECT bioguide_id, position")
            ) {
              const ids = args.slice(2).map(String);
              return {
                results: memberVotePositions.filter((row) =>
                  ids.includes(String(row.bioguide_id))
                ),
              };
            }
            if (sql.includes("FROM member_cross_votes") && sql.includes("GROUP BY bioguide_id")) {
              const ids = args.slice(2).map(String);
              return {
                results: crossCounts.filter((row) => ids.includes(String(row.bioguide_id))),
              };
            }
            return { results: [] };
          }),
          first: vi.fn(async () => {
            if (sql.includes("COUNT(*) AS count FROM member_votes")) {
              return { count: voteCount };
            }
            if (sql.includes("SUM(votes_cast)")) {
              return { total: statsSum };
            }
            return null;
          }),
          run: vi.fn(async () => ({ success: true, meta: { duration: 0 } })),
        };

        if (sql.includes("INSERT INTO member_cross_votes")) {
          bound.__kind = "cross";
          bound.__row = {
            chamber: args[0],
            congress: args[1],
            session: args[2],
            roll_number: args[3],
            bioguide_id: args[4],
            position: args[9],
            party_line: args[10],
            margin: args[11],
          };
        }
        if (sql.includes("INSERT INTO member_session_stats")) {
          bound.__kind = "stats";
          bound.__row = {
            bioguide_id: args[0],
            votes_cast: args[3],
            yea_count: args[4],
            nay_count: args[5],
            cross_vote_count: args[6],
          };
        }
        return bound;
      };

      return {
        bind,
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true, meta: { duration: 0 } })),
      };
    }),
  } as unknown as D1Database;

  return { db, crossInserts, statsUpserts };
}

describe("member session stats materialization", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  describe("memberSessionStatsOutOfSync", () => {
    it("is false when there are no member votes", async () => {
      const { db } = createDb({ voteCount: 0, statsSum: 0 });
      expect(await memberSessionStatsOutOfSync(db, 119, 2)).toBe(false);
    });

    it("is true when vote rows and stats tallies disagree", async () => {
      const { db } = createDb({ voteCount: 10, statsSum: 0 });
      expect(await memberSessionStatsOutOfSync(db, 119, 2)).toBe(true);
    });
  });

  describe("applyRollToMemberSessionStats", () => {
    it("writes cross-vote rows and refreshes tallies for voters on the roll", async () => {
      const { db, crossInserts, statsUpserts } = createDb({
        memberVotePositions: [
          { bioguide_id: "F000466", position: "Yea" },
          { bioguide_id: "D000001", position: "Nay" },
          { bioguide_id: "R000001", position: "Nay" },
          { bioguide_id: "R000002", position: "Nay" },
        ],
        crossCounts: [{ bioguide_id: "F000466", count: 1 }],
      });

      await applyRollToMemberSessionStats(
        db,
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          yeas: 220,
          nays: 210,
          vote_date: "2026-07-01",
        },
        [
          { bioguideId: "F000466", position: "Yea" },
          { bioguideId: "D000001", position: "Nay" },
          { bioguideId: "R000001", position: "Nay" },
          { bioguideId: "R000002", position: "Nay" },
        ],
        new Map([
          ["F000466", "R"],
          ["D000001", "D"],
          ["R000001", "R"],
          ["R000002", "R"],
        ])
      );

      expect(crossInserts).toEqual([
        expect.objectContaining({
          bioguide_id: "F000466",
          position: "yea",
          party_line: "nay",
          margin: 10,
        }),
      ]);
      expect(statsUpserts.find((row) => row.bioguide_id === "F000466")).toMatchObject({
        votes_cast: 1,
        yea_count: 1,
        nay_count: 0,
        cross_vote_count: 1,
      });
    });
  });

  describe("rebuildMemberSessionStats", () => {
    it("rebuilds cross votes from stored session member_votes", async () => {
      const sessionVotes = [
        {
          bioguide_id: "F000466",
          position: "Yea",
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          yeas: 220,
          nays: 210,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          vote_date: "2026-07-01",
        },
        {
          bioguide_id: "R000001",
          position: "Nay",
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          yeas: 220,
          nays: 210,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          vote_date: "2026-07-01",
        },
        {
          bioguide_id: "R000002",
          position: "Nay",
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          yeas: 220,
          nays: 210,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          vote_date: "2026-07-01",
        },
      ];

      const { db, crossInserts, statsUpserts } = createDb({
        sessionVotes,
        roster: [
          {
            bioguide_id: "F000466",
            name: "Fitz",
            chamber: "House",
            party: "R",
            state: "PA",
            district: 1,
          },
          {
            bioguide_id: "R000001",
            name: "One",
            chamber: "House",
            party: "R",
            state: "TX",
            district: 1,
          },
          {
            bioguide_id: "R000002",
            name: "Two",
            chamber: "House",
            party: "R",
            state: "FL",
            district: 1,
          },
        ],
        memberVotePositions: sessionVotes.map((row) => ({
          bioguide_id: row.bioguide_id,
          position: row.position,
        })),
        crossCounts: [{ bioguide_id: "F000466", count: 1 }],
      });

      await rebuildMemberSessionStats(db, 119, 2);

      expect(crossInserts).toEqual([
        expect.objectContaining({
          bioguide_id: "F000466",
          position: "yea",
          party_line: "nay",
        }),
      ]);
      expect(statsUpserts.length).toBeGreaterThan(0);
    });
  });
});
