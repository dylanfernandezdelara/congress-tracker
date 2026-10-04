import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sqliteD1 } from "../test/sqlite-d1";
import { SCHEMA_VERSION, ensureSchema, resetSchemaFlag } from "./schema";

describe("schema migrations on a real SQLite database", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("brings a v12 summary queue to the current version, even when two instances migrate at once", async () => {
    dir = mkdtempSync(join(tmpdir(), "schema-"));
    const dbPath = join(dir, "t.sqlite");
    // A database left at v12: digest_jobs exists without read_failures.
    execFileSync("sqlite3", [dbPath], {
      input: `CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
        INSERT INTO pipeline_state VALUES ('schema_version', '{"version":12}', 't');
        CREATE TABLE digest_jobs (congress INTEGER NOT NULL, bill_type TEXT NOT NULL, number INTEGER NOT NULL,
          state TEXT NOT NULL, tier TEXT NOT NULL, batch_id TEXT, fingerprint TEXT, attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT, queued_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (congress, bill_type, number));`,
    });
    const db = sqliteD1(dbPath);

    // Two instances that both read version 12 before either wrote 13.
    resetSchemaFlag();
    await ensureSchema(db);
    execFileSync("sqlite3", [dbPath, `UPDATE pipeline_state SET value_json = '{"version":12}' WHERE key = 'schema_version'`]);
    resetSchemaFlag();
    await expect(ensureSchema(db)).resolves.toBeUndefined();

    const columns = execFileSync("sqlite3", [dbPath, "SELECT name FROM pragma_table_info('digest_jobs')"], { encoding: "utf8" });
    expect(columns.split("\n")).toContain("read_failures");
    const version = execFileSync("sqlite3", [dbPath, "SELECT value_json FROM pipeline_state WHERE key = 'schema_version'"], { encoding: "utf8" });
    expect(JSON.parse(version).version).toBe(SCHEMA_VERSION);
  });
  const indexes = (dbPath: string) =>
    execFileSync("sqlite3", [dbPath, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'bill_committee_events'"], {
      encoding: "utf8",
    }).split("\n");

  it("drops the committee-events index on upgrade from v15 and never creates it on a fresh install", async () => {
    dir = mkdtempSync(join(tmpdir(), "schema-"));
    const upgraded = join(dir, "v15.sqlite");
    // A database left at v15: bill_committee_events still carries the committee index.
    execFileSync("sqlite3", [upgraded], {
      input: `CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
        INSERT INTO pipeline_state VALUES ('schema_version', '{"version":15}', 't');
        CREATE TABLE bill_committee_events (congress INTEGER NOT NULL, bill_type TEXT NOT NULL, bill_number INTEGER NOT NULL,
          system_code TEXT NOT NULL, activity_key TEXT NOT NULL, activity_at TEXT NOT NULL, chamber TEXT NOT NULL,
          committee_name TEXT NOT NULL, parent_system_code TEXT, activity_raw TEXT NOT NULL, tally_text TEXT,
          PRIMARY KEY (congress, bill_type, bill_number, system_code, activity_key, activity_at));
        CREATE INDEX idx_bill_committee_events_committee ON bill_committee_events (congress, system_code, activity_key);
        CREATE TABLE digest_jobs (congress INTEGER NOT NULL, bill_type TEXT NOT NULL, number INTEGER NOT NULL,
          state TEXT NOT NULL, tier TEXT NOT NULL, batch_id TEXT, fingerprint TEXT, attempts INTEGER NOT NULL DEFAULT 0,
          read_failures INTEGER NOT NULL DEFAULT 0, origin TEXT NOT NULL DEFAULT 'live',
          last_error TEXT, queued_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (congress, bill_type, number));`,
    });
    expect(indexes(upgraded)).toContain("idx_bill_committee_events_committee");
    resetSchemaFlag();
    await ensureSchema(sqliteD1(upgraded));
    expect(indexes(upgraded)).not.toContain("idx_bill_committee_events_committee");
    expect(indexes(upgraded)).toContain("idx_bill_committee_events_bill");

    const fresh = join(dir, "fresh.sqlite");
    resetSchemaFlag();
    await ensureSchema(sqliteD1(fresh));
    expect(indexes(fresh)).not.toContain("idx_bill_committee_events_committee");
    expect(indexes(fresh)).toEqual(expect.arrayContaining(["idx_bill_committee_events_bill", "idx_bill_committee_events_advance"]));
    const version = execFileSync("sqlite3", [fresh, "SELECT value_json FROM pipeline_state WHERE key = 'schema_version'"], { encoding: "utf8" });
    expect(JSON.parse(version).version).toBe(SCHEMA_VERSION);
  });
});
