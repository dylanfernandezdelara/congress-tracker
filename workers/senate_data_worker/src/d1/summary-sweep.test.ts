import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./schema", () => ({ ensureSchema: vi.fn(async () => {}) }));

import { markSummaryChecked, selectSummarySweepCandidates } from "./digests";

/** CI is Node 20 (no `node:sqlite`), so a tiny D1 stand-in runs every statement through the sqlite3 CLI. */
function sqliteD1(dbPath: string): D1Database {
  const literal = (value: unknown) =>
    typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
  const statement = (sql: string, binds: unknown[] = []) => {
    const bound = sql.replace(/\?(\d+)/g, (_m, n: string) => literal(binds[Number(n) - 1]));
    const run = (json: boolean) =>
      execFileSync("sqlite3", json ? ["-json", dbPath, bound] : [dbPath, bound], { encoding: "utf8" }).trim();
    const self = {
      bound,
      bind: (...values: unknown[]) => statement(sql, values),
      all: async () => ({ results: run(true) ? JSON.parse(run(true)) : [] }),
      run: async () => {
        run(false);
        return { success: true };
      },
    };
    return self;
  };
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      for (const s of stmts) await s.run();
      return [];
    },
  } as unknown as D1Database;
}

const FALLBACK = JSON.stringify({ headline: "To amend title 5", source: "title_fallback" });
const LLM = JSON.stringify({ headline: "Bill would expand veteran housing grants" });

describe("summary sweep candidates", () => {
  let dir: string;
  let db: D1Database;
  const now = "2026-09-26T12:00:00.000Z";
  const dayAgo = "2026-09-25T12:00:00.000Z";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "summary-sweep-"));
    const dbPath = join(dir, "t.sqlite");
    execFileSync("sqlite3", [dbPath], {
      encoding: "utf8",
      input: `
        CREATE TABLE bill_digests (congress INTEGER, bill_type TEXT, number INTEGER, title TEXT,
          raw_summary_text TEXT, digest_json TEXT, updated_at TEXT);
        CREATE TABLE bill_summary_checks (congress INTEGER, bill_type TEXT, number INTEGER, checked_at TEXT NOT NULL,
          PRIMARY KEY (congress, bill_type, number));
        INSERT INTO bill_digests VALUES
          (119, 'HR', 1, 'An act to provide for reconciliation', NULL, NULL, '2026-08-24T00:00:00Z'),   -- no digest, never checked
          (119, 'HR', 2, 'A bill', 'CRS text', '${FALLBACK.replace(/'/g, "''")}', '2026-09-01T00:00:00Z'), -- title fallback
          (119, 'HR', 3, 'A bill', NULL, '${LLM}', '2026-09-01T00:00:00Z'),        -- LLM title-only, awaiting CRS
          (119, 'HR', 4, 'A bill', NULL, '${LLM}', '2026-09-01T00:00:00Z'),        -- same, but checked an hour ago
          (119, 'HR', 5, 'A bill', 'CRS text', '${LLM}', '2026-09-01T00:00:00Z'),  -- complete
          (118, 'HR', 6, 'A bill', NULL, NULL, '2026-09-01T00:00:00Z');            -- another congress
        INSERT INTO bill_summary_checks VALUES
          (119, 'HR', 2, '2026-09-24T12:00:00.000Z'),
          (119, 'HR', 3, '2026-09-23T12:00:00.000Z'),
          (119, 'HR', 4, '2026-09-26T11:00:00.000Z');
      `,
    });
    db = sqliteD1(dbPath);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const ids = (rows: Array<{ bill_type: string; number: number }>) => rows.map((r) => `${r.bill_type}${r.number}`);

  it("picks bills still waiting on a CRS-backed digest, never-checked first, then the oldest check", async () => {
    const rows = await selectSummarySweepCandidates(db, { congress: 119, checkedBeforeIso: dayAgo, limit: 10 });
    expect(ids(rows)).toEqual(["HR1", "HR3", "HR2"]);
  });

  it("respects the per-run limit", async () => {
    const rows = await selectSummarySweepCandidates(db, { congress: 119, checkedBeforeIso: dayAgo, limit: 2 });
    expect(ids(rows)).toEqual(["HR1", "HR3"]);
  });

  it("records checks so the next run moves on, updating an existing check", async () => {
    await markSummaryChecked(
      db,
      [
        { congress: 119, bill_type: "HR", number: 1 },
        { congress: 119, bill_type: "HR", number: 3 },
      ],
      now
    );
    const rows = await selectSummarySweepCandidates(db, { congress: 119, checkedBeforeIso: dayAgo, limit: 10 });
    expect(ids(rows)).toEqual(["HR2"]);
  });
});
