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
  quote?: Record<string, unknown> | null;
}) {
  return {
    exec: vi.fn(async () => {}),
    prepare(sql: string) {
      const state = {
        bind: () => state,
        first: async () => {
          if (sql.includes("FROM bill_digests")) return options.digest ?? null;
          if (sql.includes("FROM bill_lifecycle")) return options.lifecycle ?? null;
          if (sql.includes("FROM bill_quotes")) return options.quote ?? null;
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

  it("assembles headline, tally, and status from D1", async () => {
    const env = createMockEnv({ DB: modelDb({ digest: DIGEST, votes: [VOTE] }) });
    const result = await loadOgCardModel(env as never, { congress: 119, type: "HR", number: 1 }, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model).toEqual({
      docket: "H.R. 1 · 119th Congress",
      headline: "House passes a permitting package",
      quote: null,
      status_line: "Passed House 219–213 · Sep 3, 2026",
      tally: { chamber: "House", yeas: 219, nays: 213, party_splits: [] },
    });
  });

  it("uses the trimmed title when there is no digest headline and drops the tally without votes", async () => {
    const env = createMockEnv({ DB: modelDb({ digest: { ...DIGEST, digest_json: null } }) });
    const result = await loadOgCardModel(env as never, { congress: 119, type: "HR", number: 1 }, null);
    expect(result).toMatchObject({
      ok: true,
      model: { headline: "One Big Bill Act", status_line: "Introduced · In committee", tally: null },
    });
  });

  it("returns bill_not_found / quote_not_found reasons", async () => {
    const missing = await loadOgCardModel(
      createMockEnv({ DB: modelDb({ digest: null }) }) as never,
      { congress: 119, type: "HR", number: 1 },
      null
    );
    expect(missing).toEqual({ ok: false, reason: "bill_not_found" });

    const otherBill = {
      id: "abcdefabcdefabcd",
      congress: 119,
      bill_type: "S",
      number: 9,
      text: "Quote text",
      source: "digest",
      created_at: "2026-09-01T00:00:00Z",
    };
    const mismatch = await loadOgCardModel(
      createMockEnv({ DB: modelDb({ digest: DIGEST, quote: otherBill }) }) as never,
      { congress: 119, type: "HR", number: 1 },
      "abcdefabcdefabcd"
    );
    expect(mismatch).toEqual({ ok: false, reason: "quote_not_found" });
  });

  it("puts a matching quote on the card", async () => {
    const quote = {
      id: "abcdefabcdefabcd",
      congress: 119,
      bill_type: "HR",
      number: 1,
      text: "Speeds permits.",
      source: "digest",
      created_at: "2026-09-01T00:00:00Z",
    };
    const result = await loadOgCardModel(
      createMockEnv({ DB: modelDb({ digest: DIGEST, quote }) }) as never,
      { congress: 119, type: "hr", number: 1 },
      "abcdefabcdefabcd"
    );
    expect(result).toMatchObject({ ok: true, model: { quote: "Speeds permits." } });
  });
});
