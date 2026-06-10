import { describe, expect, it, vi } from "vitest";
import { selectExistingVoteKeys } from "./votes";

function createMockDb(rows: Array<Record<string, unknown>>): D1Database {
  const runResult = { success: true, meta: { duration: 0 } };
  const stmt = () => ({
    bind: vi.fn(() => stmt()),
    all: vi.fn(async () => ({ results: rows })),
    first: vi.fn(async () => null),
    run: vi.fn(async () => runResult),
  });
  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn(() => stmt()),
  } as unknown as D1Database;
}

describe("selectExistingVoteKeys", () => {
  it("returns vote keys for passage votes in the lookback window", async () => {
    const db = createMockDb([
      { chamber: "House", congress: 119, session: 2, roll_number: 10 },
      { chamber: "Senate", congress: 119, session: 2, roll_number: 163 },
    ]);

    const keys = await selectExistingVoteKeys(db, "2026-05-01", 119);

    expect(keys).toEqual(new Set(["House:119:2:10", "Senate:119:2:163"]));
  });
});
