import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config";

const store = new Map<string, unknown>();
vi.mock("../d1/pipeline-state", () => ({
  getPipelineState: async (_db: unknown, key: string) => store.get(key) ?? null,
  setPipelineState: async (_db: unknown, key: string, value: unknown) => void store.set(key, value),
}));

import { budgetLeft, recordSpend } from "./budget";

const env = { DB: {} as D1Database, DIGEST_DAILY_BUDGET_USD: "1" } as Env;
const day = new Date("2026-09-26T12:00:00Z");

describe("daily summary budget", () => {
  it("takes back an over-estimate, never below zero", async () => {
    await recordSpend(env, 0.05, day);
    await recordSpend(env, -0.03, day);
    expect(await budgetLeft(env, day)).toBeCloseTo(0.98, 6);
    await recordSpend(env, -1, day);
    expect(await budgetLeft(env, day)).toBe(1);
  });

  it("keeps every record when several land at once (a long bill's parts are called in parallel)", async () => {
    const other = new Date("2026-09-27T12:00:00Z");
    await Promise.all([0.01, 0.02, 0.03, 0.04].map((usd) => recordSpend(env, usd, other)));
    expect(await budgetLeft(env, other)).toBeCloseTo(0.9, 6);
  });
});
