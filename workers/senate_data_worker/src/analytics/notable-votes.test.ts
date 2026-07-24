import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildNotableVotes } from "./notable-votes";
import { resetSchemaFlag } from "../d1/schema";

function createMockDb(options: {
  votes: Array<Record<string, unknown>>;
  memberVotes?: Array<Record<string, unknown>>;
  realRoster?: { house: number; senate: number };
}) {
  const stmt = (sql: string) => ({
    bind: (...bindArgs: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM votes v")) {
          const congress = bindArgs[0];
          const session = bindArgs[1];
          const lookbackStart = bindArgs[2];
          const limit = bindArgs[3];
          let results = options.votes.filter(
            (row) =>
              row.congress === congress &&
              row.session === session &&
              (lookbackStart == null || String(row.vote_date) >= String(lookbackStart))
          );
          results = [...results].sort((a, b) =>
            String(b.vote_date).localeCompare(String(a.vote_date))
          );
          if (typeof limit === "number") {
            results = results.slice(0, limit);
          }
          return { results };
        }
        if (sql.includes("FROM member_votes")) {
          return { results: options.memberVotes ?? [] };
        }
        if (sql.includes("FROM member_cross_votes")) {
          const byId = new Map<string, number>();
          for (const row of options.memberVotes ?? []) {
            const id = String(row.bioguide_id);
            // Approximate session cross counts from the loaded fixture rows.
            byId.set(id, (byId.get(id) ?? 0) + 1);
          }
          return {
            results: [...byId.entries()].map(([bioguide_id, count]) => ({
              bioguide_id,
              count,
            })),
          };
        }
        if (sql.includes("FROM members") && sql.includes("GROUP BY chamber")) {
          const roster = options.realRoster ?? { house: 0, senate: 0 };
          return {
            results: [
              { chamber: "House", seats: roster.house },
              { chamber: "Senate", seats: roster.senate },
            ],
          };
        }
        return { results: [] };
      },
      first: async () => {
        if (sql.includes("SELECT COUNT(*)")) {
          const [chamber, congress, session, rollNumber] = bindArgs;
          const count =
            options.memberVotes?.filter(
              (row) =>
                row.chamber === chamber &&
                row.congress === congress &&
                row.session === session &&
                row.roll_number === rollNumber
            ).length ?? 0;
          return { count };
        }
        return null;
      },
      run: async () => ({ success: true }),
    }),
    run: async () => ({ success: true }),
  });

  return {
    prepare: (sql: string) => stmt(sql),
    batch: async () => [],
  } as unknown as D1Database;
}

describe("buildNotableVotes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ranks close votes with party-line breaks higher", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      votes: [
        {
          chamber: "Senate",
          congress: 119,
          session: 2,
          roll_number: 10,
          bill_type: "s",
          bill_number: 47,
          yeas: 68,
          nays: 32,
          margin: 36,
          vote_date: "2026-06-03",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Routine bill headline",
          bill_title: "Sample Act",
          digest_lead: null,
          raw_summary: null,
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          bill_type: "hr",
          bill_number: 1,
          yeas: 220,
          nays: 215,
          margin: 5,
          vote_date: "2026-06-04",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Close House vote",
          bill_title: "Major policy bill",
          digest_lead: null,
          raw_summary: null,
        },
      ],
      memberVotes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          party: "D",
          position: "Nay",
          bioguide_id: "A000001",
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          party: "D",
          position: "Yea",
          bioguide_id: "B000002",
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          party: "R",
          position: "Yea",
          bioguide_id: "C000003",
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          party: "R",
          position: "Nay",
          bioguide_id: "D000004",
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 2);
    expect(notable.length).toBeGreaterThan(0);
    expect(notable[0]?.chamber).toBe("House");
    expect(notable[0]?.why_it_matters).toContain("just 5 votes");
    expect(notable[0]?.member_votes_available).toBe(true);
  });

  it("filters procedural resolutions unless truly significant", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 20,
          bill_type: "hres",
          bill_number: 512,
          yeas: 220,
          nays: 210,
          margin: 10,
          vote_date: "2026-06-04",
          result: "Passed",
          question: "On Agreeing to the Resolution",
          headline: null,
          bill_title: "Providing for consideration of the bill (H.R. 1), to do something",
          digest_lead: null,
          raw_summary: null,
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 21,
          bill_type: "hr",
          bill_number: 900,
          yeas: 220,
          nays: 215,
          margin: 5,
          vote_date: "2026-06-03",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Substantive close vote",
          bill_title: "Important Act",
          digest_lead: null,
          raw_summary: null,
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 1);
    expect(notable).toHaveLength(1);
    expect(notable[0]?.bill_type).toBe("hr");
  });

  it("returns empty when no votes meet significance threshold", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 1,
          bill_type: "hr",
          bill_number: 99,
          yeas: 400,
          nays: 20,
          margin: 380,
          vote_date: "2026-06-01",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Landslide",
          bill_title: "Routine",
          digest_lead: null,
          raw_summary: null,
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 3);
    expect(notable).toEqual([]);
  });

  it("describes failed close votes without saying Passed", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 12,
          bill_type: "hr",
          bill_number: 99,
          yeas: 210,
          nays: 215,
          margin: 5,
          vote_date: "2026-06-03",
          result: "Not agreed to",
          question: "On Passage of the Bill",
          headline: "Close House failure",
          bill_title: "Failed bill",
          digest_lead: null,
          raw_summary: null,
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 1);
    expect(notable).toHaveLength(1);
    expect(notable[0]?.why_it_matters).toContain("Failed in the House");
    expect(notable[0]?.why_it_matters).not.toContain("Passed");
  });

  it("marks member_votes_available false when only local sample votes exist on a real roster", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      realRoster: { house: 435, senate: 100 },
      votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          bill_type: "hr",
          bill_number: 1,
          yeas: 220,
          nays: 215,
          margin: 5,
          vote_date: "2026-06-04",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Close House vote",
          bill_title: "Major policy bill",
          digest_lead: null,
          raw_summary: null,
        },
      ],
      memberVotes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          party: "D",
          position: "Nay",
          bioguide_id: "LOCAL:H001",
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 11,
          party: "R",
          position: "Yea",
          bioguide_id: "LOCAL:H002",
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 1);
    expect(notable).toHaveLength(1);
    expect(notable[0]?.member_votes_available).toBe(false);
    expect(notable[0]?.defectors).toEqual([]);
  });

  it("excludes notable votes outside the 14-day lookback", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 30,
          bill_type: "hr",
          bill_number: 100,
          yeas: 220,
          nays: 215,
          margin: 5,
          vote_date: "2026-06-14",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Recent close vote",
          bill_title: "Recent Act",
          digest_lead: null,
          raw_summary: null,
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          bill_type: "hr",
          bill_number: 50,
          yeas: 220,
          nays: 219,
          margin: 1,
          vote_date: "2026-05-20",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Older razor-thin vote",
          bill_title: "Older Act",
          digest_lead: null,
          raw_summary: null,
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 3);
    expect(notable).toHaveLength(1);
    expect(notable[0]?.vote_date).toBe("2026-06-14");
  });

  it("returns empty when no votes fall within the lookback window", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          bill_type: "hr",
          bill_number: 50,
          yeas: 220,
          nays: 219,
          margin: 1,
          vote_date: "2026-05-01",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Old close vote",
          bill_title: "Old Act",
          digest_lead: null,
          raw_summary: null,
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 3);
    expect(notable).toEqual([]);
  });

  it("includes votes on the first day of the 14-day window and excludes the day before", async () => {
    resetSchemaFlag();
    const db = createMockDb({
      votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 40,
          bill_type: "hr",
          bill_number: 40,
          yeas: 220,
          nays: 215,
          margin: 5,
          vote_date: "2026-06-02",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Window start vote",
          bill_title: "Window Act",
          digest_lead: null,
          raw_summary: null,
        },
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 41,
          bill_type: "hr",
          bill_number: 41,
          yeas: 220,
          nays: 219,
          margin: 1,
          vote_date: "2026-06-01",
          result: "Passed",
          question: "On Passage of the Bill",
          headline: "Day before window",
          bill_title: "Too old",
          digest_lead: null,
          raw_summary: null,
        },
      ],
    });

    const { notable } = await buildNotableVotes(db, 119, 2, 3);
    expect(notable).toHaveLength(1);
    expect(notable[0]?.vote_date).toBe("2026-06-02");
  });
});
