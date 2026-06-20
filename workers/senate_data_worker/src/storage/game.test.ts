import { describe, expect, it, vi } from "vitest";
import { buildGamePrompt, getGameCorrectAnswer } from "../../../../shared/feed-content";
import type { GameVoteCandidateRow } from "../d1/game-votes";
import { buildGameReveal, buildGameRounds } from "./game";

function createMockDb(rows: GameVoteCandidateRow[] = []): D1Database {
  const runResult = { success: true, meta: { duration: 0 } };
  const stmt = () => ({
    bind: vi.fn(() => stmt()),
    all: vi.fn(async () => ({ results: rows })),
    first: vi.fn(async () => rows[0] ?? null),
    run: vi.fn(async () => runResult),
  });
  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn(() => stmt()),
  } as unknown as D1Database;
}

const eligibleRow: GameVoteCandidateRow = {
  chamber: "Senate",
  congress: 119,
  session: 2,
  roll_number: 7,
  bill_congress: 119,
  bill_type: "S",
  bill_number: 2,
  question: "On Passage of the Bill",
  result: "Passed",
  yeas: 52,
  nays: 47,
  vote_date: "2026-06-05",
  title: "Sample Act",
  raw_summary_text: null,
  digest_json: JSON.stringify({
    headline: "Aid package for allies",
    what_it_does: "Sends emergency funding to partner nations.",
    key_points: [],
    terms_explained: [],
  }),
};

describe("buildGameRounds", () => {
  it("returns requested limit even when the pool is empty", async () => {
    const response = await buildGameRounds(createMockDb(), { limit: 20 });
    expect(response).toEqual({ rounds: [], total: 0, limit: 20 });
  });

  it("filters ineligible votes and keeps eligible rounds", async () => {
    const proceduralRow: GameVoteCandidateRow = {
      ...eligibleRow,
      roll_number: 8,
      question: "On Cloture",
    };
    const response = await buildGameRounds(createMockDb([eligibleRow, proceduralRow]), { limit: 5 });
    expect(response.total).toBe(1);
    expect(response.rounds).toHaveLength(1);
    expect(response.rounds[0]?.id).toBe("Senate:119:2:7");
  });
});

describe("buildGameReveal", () => {
  it("returns null for ineligible reveal ids", async () => {
    const ambiguousRow = { ...eligibleRow, result: "Withdrawn" };
    const reveal = await buildGameReveal(createMockDb([ambiguousRow]), "Senate:119:2:7");
    expect(reveal).toBeNull();
  });

  it("returns reveal data for eligible rounds", async () => {
    const reveal = await buildGameReveal(createMockDb([eligibleRow]), "Senate:119:2:7");
    expect(reveal).toMatchObject({
      id: "Senate:119:2:7",
      correct: "passed",
      vote: { yeas: 52, nays: 47 },
    });
    expect(getGameCorrectAnswer(eligibleRow.result)).toBe("passed");
    expect(
      buildGamePrompt({
        title: eligibleRow.title,
        question: eligibleRow.question,
        digest: JSON.parse(eligibleRow.digest_json ?? "{}"),
        rawSummaryText: eligibleRow.raw_summary_text,
      })
    ).not.toBeNull();
  });
});
