import { describe, expect, it, vi } from "vitest";

import type { DigestRow } from "../d1/digests";
import { buildStatusLine, formatCardDate, loadOgCardModel } from "./og-card-model";
import { createMockEnv } from "./test-fixtures";

const DIGEST: DigestRow = {
  congress: 119,
  bill_type: "HR",
  number: 1,
  title: "One Big Bill Act, and for other purposes",
  policy_area: null,
  raw_summary_text: null,
  digest_json: JSON.stringify({
    headline: "House passes a permitting package",
    what_it_does: "Speeds permits.",
    key_points: [],
    terms_explained: [],
  }),
};

const VOTE = {
  chamber: "House",
  congress: 119,
  session: 2,
  roll_number: 400,
  question: "On Passage",
  result: "Passed",
  yeas: 219,
  nays: 213,
  vote_date: "2026-09-03",
};

function modelDb(options: {
  digest?: DigestRow | null;
  votes?: Array<typeof VOTE>;
  lifecycle?: Record<string, unknown> | null;
}) {
  return {
    exec: vi.fn(async () => {}),
    prepare(sql: string) {
      const state = {
        bind: () => state,
        first: async () => {
          if (sql.includes("FROM bill_digests")) return options.digest ?? null;
          if (sql.includes("FROM bill_lifecycle")) return options.lifecycle ?? null;
          return null;
        },
        all: async () => {
          if (sql.includes("FROM votes")) return { results: options.votes ?? [] };
          return { results: [] };
        },
        run: async () => ({ success: true, meta: { changes: 0, duration: 0 } }),
      };
      return state;
    },
  } as unknown as D1Database;
}

describe("og card model", () => {
  it("formats card dates and status lines", () => {
    expect(formatCardDate("2026-09-03T00:00:00Z")).toBe("Sep 3, 2026");
    expect(formatCardDate(null)).toBeNull();
    expect(buildStatusLine({ latestVote: VOTE, becameLawDate: null, vetoedDate: null })).toBe(
      "Passed House 219–213 · Sep 3, 2026"
    );
    expect(
      buildStatusLine({ latestVote: { ...VOTE, result: "Failed" }, becameLawDate: null, vetoedDate: null })
    ).toBe("Failed House 219–213 · Sep 3, 2026");
    expect(buildStatusLine({ latestVote: VOTE, becameLawDate: "2026-09-08", vetoedDate: null })).toBe(
      "Became law · Sep 8, 2026"
    );
    expect(buildStatusLine({ latestVote: null, becameLawDate: null, vetoedDate: "2026-09-08" })).toBe(
      "Vetoed · Sep 8, 2026"
    );
    expect(buildStatusLine({ latestVote: null, becameLawDate: null, vetoedDate: null })).toBe(
      "Introduced · In committee"
    );
  });

  const HR1 = { congress: 119, type: "HR", number: 1 };
  const lifecycleRow = (dates: Record<string, string>) => ({
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    became_law_date: null,
    vetoed_date: null,
    law_kind: null,
    ...dates,
  });
  const load = (db: Parameters<typeof modelDb>[0], bill = HR1) =>
    loadOgCardModel(createMockEnv({ DB: modelDb(db) }) as never, bill);

  it("assembles headline, outcome, tally, and status from D1", async () => {
    const result = await load({ digest: DIGEST, votes: [VOTE] });
    expect(result).toEqual({
      ok: true,
      model: {
        bill_label: "H.R. 1",
        docket: "H.R. 1 · 119th Congress",
        headline: "House passes a permitting package",
        outcome: "passed",
        outcome_label: "Passed House",
        outcome_date: null,
        status_line: "Passed House 219–213 · Sep 3, 2026",
        tally: { chamber: "House", yeas: 219, nays: 213, party_splits: [] },
        two_thirds: false,
      },
    });
  });

  it("uses the trimmed title when there is no digest headline, and says In committee without votes", async () => {
    const result = await load({ digest: { ...DIGEST, digest_json: null } });
    expect(result).toMatchObject({
      ok: true,
      model: {
        headline: "One Big Bill Act",
        outcome: "no_vote",
        outcome_label: "In committee",
        outcome_date: null,
        tally: null,
        two_thirds: false,
      },
    });
  });

  it("puts enactment ahead of the vote, with its date and no tally", async () => {
    const result = await load({ digest: DIGEST, votes: [VOTE], lifecycle: lifecycleRow({ became_law_date: "2025-07-04" }) });
    expect(result).toMatchObject({
      ok: true,
      model: { outcome: "law", outcome_label: "Became law", outcome_date: "Jul 4, 2025", tally: null },
    });
  });

  it("shows a veto with its date", async () => {
    const result = await load({ digest: DIGEST, votes: [VOTE], lifecycle: lifecycleRow({ vetoed_date: "2026-09-08" }) });
    expect(result).toMatchObject({
      ok: true,
      model: { outcome: "vetoed", outcome_label: "Vetoed", outcome_date: "Sep 8, 2026", tally: null },
    });
  });

  it("marks a failed vote, and one that needed two-thirds", async () => {
    const suspension = { ...VOTE, question: "On Motion to Suspend the Rules and Pass", result: "Failed", yeas: 212, nays: 206 };
    expect(await load({ digest: DIGEST, votes: [suspension] })).toMatchObject({
      ok: true,
      model: { outcome: "failed", outcome_label: "Failed House", two_thirds: true, tally: { yeas: 212, nays: 206 } },
    });
    const override = { ...VOTE, chamber: "Senate", question: "On Overriding the Veto" };
    expect(await load({ digest: DIGEST, votes: [override] })).toMatchObject({
      ok: true,
      model: { outcome_label: "Passed Senate", two_thirds: true },
    });
  });

  it("treats a constitutional amendment as a two-thirds vote on any question", async () => {
    const amendment = {
      ...DIGEST,
      bill_type: "HJRES",
      title: "Proposing an amendment to the Constitution of the United States relative to the Supreme Court.",
    };
    const result = await load({ digest: amendment, votes: [VOTE] }, { congress: 119, type: "HJRES", number: 1 });
    expect(result).toMatchObject({ ok: true, model: { two_thirds: true, bill_label: "H.J.Res. 1" } });
    expect(await load({ digest: DIGEST, votes: [VOTE] })).toMatchObject({ ok: true, model: { two_thirds: false } });
  });

  it("returns bill_not_found without a digest", async () => {
    expect(await load({ digest: null })).toEqual({ ok: false, reason: "bill_not_found" });
  });
});
