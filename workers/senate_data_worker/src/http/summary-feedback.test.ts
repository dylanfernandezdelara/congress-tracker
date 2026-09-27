import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { sqliteD1 } from "../test/sqlite-d1";

vi.mock("../d1/schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../d1/schema")>()),
  ensureSchema: vi.fn(async () => {}),
}));

import { SCHEMA_DDL } from "../d1/schema";
import { FEEDBACK_MAX_MISTAKES_PER_BILL_PER_DAY, FEEDBACK_MAX_PER_CLIENT_PER_DAY } from "../d1/summary-feedback";
import { handleSummaryFeedback } from "./summary-feedback";

const NOW = new Date("2026-09-27T03:00:00.000Z");
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const digest = JSON.stringify({
  headline: "Bill would cap airline fees",
  what_it_does: "Caps fees.",
  generator: { model: "openai/gpt-6-luna", prompt_version: "v3", tier: "new", fingerprint: "fp1", long: false },
});

describe("POST /feedback/summary", () => {
  let dir: string;
  let dbPath: string;
  let env: Env;
  const rows = () =>
    JSON.parse(
      execFileSync("sqlite3", ["-json", dbPath, "SELECT kind, note, headline, model, prompt_version, fingerprint, client_hash FROM digest_feedback ORDER BY id"], {
        encoding: "utf8",
      }) || "[]"
    );
  const post = (body: unknown, headers: Record<string, string> = {}, method = "POST") =>
    handleSummaryFeedback(
      new Request("https://trackcongress.org/feedback/summary", {
        method,
        headers: { Origin: "https://trackcongress.org", "CF-Connecting-IP": "203.0.113.7", ...headers },
        body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
      env,
      json,
      NOW
    );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "feedback-"));
    dbPath = join(dir, "t.sqlite");
    execFileSync("sqlite3", [dbPath], { input: SCHEMA_DDL.map((s) => `${s};`).join("\n") });
    execFileSync("sqlite3", [dbPath, `INSERT INTO bill_digests VALUES (119, 'HR', 1, 't', NULL, NULL, '${digest}', 'x', 'x')`]);
    env = {
      DB: sqliteD1(dbPath),
      ALLOWED_ORIGIN: "https://trackcongress.org,https://www.trackcongress.org",
      FEEDBACK_HASH_SECRET: "test-secret",
    } as Env;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("records a vote with the summary's model and prompt, never the raw IP", async () => {
    const res = await post({ bill: "119-hr-1", kind: "helpful" });

    expect(res.status).toBe(200);
    const [row] = rows();
    expect(row).toMatchObject({ kind: "helpful", note: null, headline: "Bill would cap airline fees", model: "openai/gpt-6-luna", prompt_version: "v3", fingerprint: "fp1" });
    expect(row.client_hash).toMatch(/^[0-9a-f]{24}$/);
    expect(row.client_hash).not.toContain("203.0.113.7");
  });

  it("replaces a reader's earlier vote on the same bill that day", async () => {
    await post({ bill: "119-hr-1", kind: "helpful" });
    await post({ bill: "119-hr-1", kind: "unhelpful" });
    expect(rows().map((r: { kind: string }) => r.kind)).toEqual(["unhelpful"]);
  });

  it("keeps mistake notes, trimmed and capped, and rate-limits repeat reports", async () => {
    for (let i = 0; i < FEEDBACK_MAX_MISTAKES_PER_BILL_PER_DAY; i += 1) {
      expect((await post({ bill: "119-hr-1", kind: "mistake", note: `  ${"x".repeat(600)}  ` })).status).toBe(200);
    }
    expect((await post({ bill: "119-hr-1", kind: "mistake", note: "again" })).status).toBe(429);
    expect(rows()[0].note).toHaveLength(500);
    // Another reader is not affected.
    expect((await post({ bill: "119-hr-1", kind: "mistake" }, { "CF-Connecting-IP": "198.51.100.2" })).status).toBe(200);
  });

  it("drops a note sent with a vote, caps each reader's day, and erases earlier days' hashes", async () => {
    execFileSync("sqlite3", [dbPath, `INSERT INTO digest_feedback (congress, bill_type, number, kind, client_hash, created_at) VALUES (119, 'HR', 1, 'helpful', 'old', '2026-09-25T10:00:00.000Z')`]);
    await post({ bill: "119-hr-1", kind: "helpful", note: "a note" });
    expect(rows().map((r: { note: string | null; client_hash: string }) => [r.note, r.client_hash === "" ? "erased" : "kept"])).toEqual([
      [null, "erased"],
      [null, "kept"],
    ]);
    const hash = rows()[1].client_hash as string;
    const values = Array.from({ length: FEEDBACK_MAX_PER_CLIENT_PER_DAY }, (_, i) => `(119, 'HR', 1, 'mistake', '${hash}', '2026-09-27T01:${String(i).padStart(2, "0")}:00.000Z')`);
    execFileSync("sqlite3", [dbPath, `INSERT INTO digest_feedback (congress, bill_type, number, kind, client_hash, created_at) VALUES ${values.join(",")}`]);
    expect((await post({ bill: "119-hr-1", kind: "helpful" })).status).toBe(429);
  });

  it("refuses other or missing origins, other methods, large bodies, bad input, and bills without a summary", async () => {
    expect((await post({ bill: "119-hr-1", kind: "helpful" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ bill: "119-hr-1", kind: "helpful" }, { Origin: "" })).status).toBe(403);
    expect((await post(null, {}, "GET")).status).toBe(405);
    expect((await post({ bill: "119-hr-1", kind: "mistake", note: "é".repeat(2_100) })).status).toBe(413);
    expect((await post({ bill: "119-hr-1", kind: "helpful" }, { "Content-Length": "999999" })).status).toBe(413);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ bill: "hr1", kind: "helpful" })).status).toBe(400);
    expect((await post({ bill: "119-hr-1", kind: "love" })).status).toBe(400);
    expect((await post({ bill: "119-hr-2", kind: "helpful" })).status).toBe(404);
    expect(rows()).toEqual([]);
  });

  it("accepts any origin when the site allows all (preview and local dev)", async () => {
    env = { ...env, ALLOWED_ORIGIN: "*" } as Env;
    expect((await post({ bill: "119-hr-1", kind: "helpful" }, { Origin: "http://localhost:5173" })).status).toBe(200);
  });
});
