import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "../test/sqlite-d1";

vi.mock("./schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./schema")>()),
  ensureSchema: vi.fn(async () => {}),
}));

import {
  enqueueDigestJobs,
  markAttempt,
  insertDigestStubs,
  markJobsBatched,
  selectBatchJobs,
  selectQueuedJobs,
  selectRecheckBills,
  settleJob,
} from "./digest-jobs";
import { SCHEMA_DDL, SCHEMA_MIGRATIONS } from "./schema";

const T0 = "2026-09-26T10:00:00.000Z";
const T1 = "2026-09-26T11:00:00.000Z";
const hr = (number: number) => ({ congress: 119, type: "HR", number });

describe("digest jobs", () => {
  let dir: string;
  let dbPath: string;
  let db: D1Database;
  const sql = (statements: string) => execFileSync("sqlite3", [dbPath], { encoding: "utf8", input: statements });
  const jobs = () =>
    JSON.parse(execFileSync("sqlite3", ["-json", dbPath, "SELECT number, state, tier, attempts, batch_id FROM digest_jobs ORDER BY number"], { encoding: "utf8" }) || "[]");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "digest-jobs-"));
    dbPath = join(dir, "t.sqlite");
    sql([...SCHEMA_DDL, ...SCHEMA_MIGRATIONS.flatMap((m) => m.statements)].map((s) => `${s};`).join("\n"));
    db = sqliteD1(dbPath);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("queues bills once, and never lowers a tier", async () => {
    await enqueueDigestJobs(db, [hr(1), hr(2)], "rewrite", T0);
    await enqueueDigestJobs(db, [hr(1), hr(3)], "new", T1);

    expect(jobs()).toEqual([
      { number: 1, state: "queued", tier: "rewrite", attempts: 0, batch_id: null },
      { number: 2, state: "queued", tier: "rewrite", attempts: 0, batch_id: null },
      { number: 3, state: "queued", tier: "new", attempts: 0, batch_id: null },
    ]);
  });

  it("leaves a batched bill in its batch and re-queues a done one", async () => {
    await enqueueDigestJobs(db, [hr(1), hr(2)], "new", T0);
    await markJobsBatched(db, [{ ref: hr(1), fingerprint: "a" }], "batch-1", T0);
    await settleJob(db, hr(2), "done", { nowIso: T0 });
    await enqueueDigestJobs(db, [hr(1), hr(2)], "new", T1);

    expect(jobs()).toEqual([
      { number: 1, state: "batched", tier: "new", attempts: 1, batch_id: "batch-1" },
      { number: 2, state: "queued", tier: "new", attempts: 0, batch_id: null },
    ]);
    expect((await selectBatchJobs(db, "batch-1")).map((j) => [j.number, j.fingerprint])).toEqual([[1, "a"]]);
  });

  it("counts batch tries per fingerprint, records paid tries up front, and keeps settled values", async () => {
    const row = () => JSON.parse(execFileSync("sqlite3", ["-json", dbPath, "SELECT state, attempts, fingerprint, batch_id FROM digest_jobs"], { encoding: "utf8" }))[0];
    await enqueueDigestJobs(db, [hr(1)], "new", T0);
    await markJobsBatched(db, [{ ref: hr(1), fingerprint: "a" }], "b1", T0);
    await settleJob(db, hr(1), "queued", { error: "batch expired" });
    await markJobsBatched(db, [{ ref: hr(1), fingerprint: "a" }], "b2", T0);
    expect(row()).toMatchObject({ state: "batched", attempts: 2, fingerprint: "a" });
    await markJobsBatched(db, [{ ref: hr(1), fingerprint: "b" }], "b3", T0);
    expect(row()).toMatchObject({ attempts: 1, fingerprint: "b" });
    await markAttempt(db, hr(1), "b", 2, T1);
    expect(row()).toEqual({ state: "queued", attempts: 2, fingerprint: "b", batch_id: null });
    await settleJob(db, hr(1), "done", { fingerprint: "b", attempts: 0 });
    expect(row()).toMatchObject({ state: "done", attempts: 0 });
  });

  it("counts unreadable runs apart, and clears them once the bill is read", async () => {
    const failures = () =>
      JSON.parse(execFileSync("sqlite3", ["-json", dbPath, "SELECT read_failures, attempts FROM digest_jobs"], { encoding: "utf8" }))[0];
    await enqueueDigestJobs(db, [hr(1)], "new", T0);
    await markJobsBatched(db, [{ ref: hr(1), fingerprint: "a" }], "b1", T0);
    await settleJob(db, hr(1), "queued", { readFailures: 2 });
    expect(failures()).toEqual({ read_failures: 2, attempts: 1 });
    await settleJob(db, hr(1), "done", { fingerprint: "a", attempts: 0 });
    expect(failures()).toEqual({ read_failures: 0, attempts: 0 });
  });

  it("does not re-queue a bill checked on a later day than its last Congress.gov change", async () => {
    await enqueueDigestJobs(db, [hr(1), hr(2)], "new", T0);
    await settleJob(db, hr(1), "done", { nowIso: "2026-09-26T09:00:00.000Z" });
    await settleJob(db, hr(2), "done", { nowIso: "2026-09-26T09:00:00.000Z" });
    await enqueueDigestJobs(db, [{ ...hr(1), changedOn: "2026-09-25" }, { ...hr(2), changedOn: "2026-09-26" }], "new", T1);
    expect(jobs().map((j: { state: string }) => j.state)).toEqual(["done", "queued"]);
  });

  it("splits the queue by whether a bill matters: a vote, a committee report, a law, or a rewrite request (any type case)", async () => {
    sql(`
      INSERT INTO votes VALUES ('House', 119, 2, 10, 119, 'hr', 2, 'On Passage', 'Passed', 300, 100, '2026-09-01', 1);
      INSERT INTO bill_committee_events VALUES (119, 'HR', 3, 'hsif00', 'advanced', '2026-09-01', 'House', 'Energy', NULL, 'Reported', NULL);
      INSERT INTO bill_committee_events VALUES (119, 'HR', 6, 'hsif00', 'sent', '2026-09-01', 'House', 'Energy', NULL, 'Referred', NULL);
      INSERT INTO bill_lifecycle (congress, bill_type, bill_number, became_law_date, updated_at) VALUES (119, 'hr', 4, '2026-07-04', '${T0}');
    `);
    await enqueueDigestJobs(db, [hr(1), hr(2), hr(3), hr(4), hr(6)], "new", T0);
    await enqueueDigestJobs(db, [hr(5)], "rewrite", T1);

    expect((await selectQueuedJobs(db, { matters: true, limit: 10 })).map((j) => j.number)).toEqual([2, 3, 4, 5]);
    expect((await selectQueuedJobs(db, { matters: false, limit: 10 })).map((j) => j.number)).toEqual([1, 6]);
    expect(await selectQueuedJobs(db, { matters: false, limit: 0 })).toEqual([]);
  });

  it("re-checks bills the queue knows that still wait on text, and leaves unknown rows to the backfill", async () => {
    const gen = (basis: string) =>
      JSON.stringify({ headline: "h", what_it_does: "w", basis, generator: { tier: "new", fingerprint: "f" } });
    const fallback = JSON.stringify({ headline: "h", what_it_does: "w", source: "title_fallback" });
    await insertDigestStubs(db, [{ ...hr(1), title: "Stub" }, { ...hr(9), title: " " }], T0);
    sql(`
      INSERT INTO bill_digests VALUES (119, 'HR', 2, 't', NULL, NULL, '${fallback}', '${T0}', '${T0}');
      INSERT INTO bill_digests VALUES (119, 'HR', 3, 't', NULL, NULL, '${gen("title_only")}', '${T0}', '${T0}');
      INSERT INTO bill_digests VALUES (119, 'HR', 4, 't', NULL, NULL, '${gen("text")}', '${T0}', '${T0}');
      INSERT INTO bill_digests VALUES (119, 'HR', 5, 't', NULL, NULL, '{"headline":"old","what_it_does":"free model"}', '${T0}', '${T0}');
      INSERT INTO bill_digests VALUES (119, 'HR', 7, 't', NULL, NULL, '${gen("crs")}', '${T0}', '${T0}');
      INSERT INTO bill_digests VALUES (119, 'HR', 8, 't', NULL, NULL, '${fallback}', '${T0}', '${T0}');
    `);
    const checked = [1, 2, 4, 5, 7].map(hr);
    await enqueueDigestJobs(db, checked, "new", T0);
    for (const bill of checked) await settleJob(db, bill, "done", { nowIso: "2026-09-24T00:00:00.000Z" });
    await enqueueDigestJobs(db, [hr(3)], "new", T0);

    const due = await selectRecheckBills(db, { congress: 119, checkedBeforeIso: "2026-09-25T10:00:00.000Z", limit: 10 });
    // 3 is already queued; 4 is written from text; 5 is pre-v3; 8 was never queued (backfill); 9 had no title.
    expect(due.map((b) => b.number).sort()).toEqual([1, 2, 7]);
  });
});
