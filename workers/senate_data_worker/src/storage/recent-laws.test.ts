import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { resetSchemaFlag } from "../d1/schema";
import { buildRecentLaws } from "./recent-laws";

const mockBuildFeedItemsForBills = vi.fn();

vi.mock("./feed", () => ({
  buildFeedItemsForBills: (...args: unknown[]) => mockBuildFeedItemsForBills(...args),
}));

type LawFixture = {
  congress: number;
  bill_type: string;
  bill_number: number;
  title: string | null;
  policy_area: string | null;
  headline: string | null;
  became_law_date: string;
  law_kind: string | null;
  public_law: string | null;
  signed_date: string | null;
  presented_date: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  latest_passage_vote_date: string | null;
};

function createRecentLawsDb(rows: LawFixture[]): D1Database {
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM bill_lifecycle l") && sql.includes("became_law_date IS NOT NULL")) {
          const congress = args[0] as number;
          const limit = args[1] as number;
          const results = rows
            .filter((row) => row.congress === congress)
            .filter(
              (row) =>
                row.law_kind == null ||
                (row.law_kind !== "vetoed" && row.law_kind !== "pocket_vetoed")
            )
            .sort((a, b) => {
              const byLaw = b.became_law_date.localeCompare(a.became_law_date);
              if (byLaw !== 0) return byLaw;
              return (b.latest_action_date ?? "").localeCompare(a.latest_action_date ?? "");
            })
            .slice(0, limit);
          return { results };
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
    exec: async () => ({}),
  } as unknown as D1Database;
}

function createEnv(db: D1Database): Env {
  return { DB: db } as Env;
}

describe("buildRecentLaws", () => {
  beforeEach(() => {
    resetSchemaFlag();
    mockBuildFeedItemsForBills.mockReset();
    mockBuildFeedItemsForBills.mockImplementation(async (_env: Env, rows: Array<{ bill_number: number }>) =>
      rows.map((row) => ({
        bill: {
          congress: 119,
          type: "HR",
          number: row.bill_number,
          title: `Item ${row.bill_number}`,
        },
        policy_area: null,
        digest: null,
        raw_summary_text: null,
        passage_votes: [],
        latest_passage_date: null,
        latest_activity_date: "",
        lifecycle: null,
        executive_signals: [],
        related_executive_bills: [],
      }))
    );
  });

  it("returns the typed envelope with laws ordered newest first and attached items", async () => {
    const db = createRecentLawsDb([
      {
        congress: 119,
        bill_type: "HR",
        bill_number: 100,
        title: "Older Law",
        policy_area: "Energy",
        headline: "Older headline",
        became_law_date: "2026-05-01",
        law_kind: "signed",
        public_law: "119-5",
        signed_date: "2026-05-01",
        presented_date: "2026-04-20",
        latest_action_date: "2026-05-01",
        latest_action_text: "Became Public Law No: 119-5.",
        latest_passage_vote_date: "2026-04-15",
      },
      {
        congress: 119,
        bill_type: "S",
        bill_number: 50,
        title: "Newer Law",
        policy_area: "Housing",
        headline: "Newer headline",
        became_law_date: "2026-07-15",
        law_kind: "signed",
        public_law: "119-20",
        signed_date: "2026-07-15",
        presented_date: "2026-07-01",
        latest_action_date: "2026-07-15",
        latest_action_text: "Became Public Law No: 119-20.",
        latest_passage_vote_date: null,
      },
    ]);

    const body = await buildRecentLaws(
      createEnv(db),
      119,
      2,
      5,
      "2026-07-28T12:00:00.000Z"
    );
    expect(body).toMatchObject({
      congress: 119,
      session: 2,
      as_of: "2026-07-28T12:00:00.000Z",
    });
    expect(body.laws).toHaveLength(2);
    expect(body.laws[0]?.bill_number).toBe(50);
    expect(body.laws[0]?.headline).toBe("Newer headline");
    expect(body.laws[0]?.latest_passage_vote_date).toBeNull();
    expect(body.laws[0]?.item?.bill.number).toBe(50);
    expect(body.laws[1]?.bill_number).toBe(100);
    expect(body.laws[1]?.latest_passage_vote_date).toBe("2026-04-15");
    expect(body.laws[1]?.item?.bill.number).toBe(100);

    expect(mockBuildFeedItemsForBills).toHaveBeenCalledTimes(1);
    expect(mockBuildFeedItemsForBills).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          bill_congress: 119,
          bill_type: "S",
          bill_number: 50,
          latest_passage_date: null,
        }),
        expect.objectContaining({
          bill_congress: 119,
          bill_type: "HR",
          bill_number: 100,
          latest_passage_date: "2026-04-15",
          latest_activity_date: "2026-05-01",
        }),
      ],
      expect.objectContaining({
        now: "2026-07-28T12:00:00.000Z",
        executiveSince: expect.any(String),
      })
    );
  });

  it("skips feed assembly when there are no laws", async () => {
    const body = await buildRecentLaws(createEnv(createRecentLawsDb([])), 119, 2, 5);
    expect(body.laws).toEqual([]);
    expect(mockBuildFeedItemsForBills).not.toHaveBeenCalled();
  });
});
