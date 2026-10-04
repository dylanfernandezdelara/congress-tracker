import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { sqliteD1 } from "../test/sqlite-d1";

// Real SQLite (the sqlite3 CLI, as in schema-migrate.test.ts) so the atomic upsert's SQL is what is tested. Only the
// schema bootstrap is stubbed; the table is created here.
vi.mock("../d1/schema", () => ({ ensureSchema: async () => undefined }));

import { budgetLeft, recordSpend } from "./budget";

const dir = mkdtempSync(join(tmpdir(), "budget-"));
const dbPath = join(dir, "t.sqlite");
execFileSync("sqlite3", [dbPath, "CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);"]);
const env = { DB: sqliteD1(dbPath), DIGEST_DAILY_BUDGET_USD: "1" } as Env;
const day = new Date("2026-09-26T12:00:00Z");

describe("daily summary budget", () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

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

  it("records on the UTC day it is given, not the day the record happens to run", async () => {
    const lateNight = new Date("2026-09-28T23:59:59.900Z");
    await recordSpend(env, 0.05, lateNight);
    await recordSpend(env, -0.02, lateNight);
    expect(await budgetLeft(env, lateNight)).toBeCloseTo(0.97, 6);
    expect(await budgetLeft(env, new Date("2026-09-29T00:00:01Z"))).toBe(1);
  });
});
