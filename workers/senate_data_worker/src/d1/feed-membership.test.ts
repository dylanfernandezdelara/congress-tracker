import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTRO_FEED_MAX_NEW } from "../constants";
import {
  introRelevanceScoreSql,
  selectIntroPersistSet,
} from "../sources/intro-relevance";
import { feedMembershipCteSql, introOnlyMembershipSql } from "./feed-membership";

/** CI is Node 20 (`node:sqlite` is 22.5+). Drive the real SQL with the sqlite3 CLI. */
function bindSql(sql: string, values: Array<string | number>): string {
  let i = 0;
  return sql.replace(/\?/g, () => {
    const value = values[i++];
    if (value === undefined) throw new Error("missing SQL bind");
    return typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
  });
}

function querySqliteJson(setupSql: string, query: string): Array<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), "intro-rank-"));
  const dbPath = join(dir, "t.sqlite");
  try {
    execFileSync("sqlite3", [dbPath], { input: setupSql, encoding: "utf8" });
    const raw = execFileSync("sqlite3", ["-json", dbPath, query], { encoding: "utf8" }).trim();
    return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("intro feed membership ranking", () => {
  it("orders the intro UNION by persist score, not introduced_date alone", () => {
    const sql = feedMembershipCteSql();
    const scoreSql = introRelevanceScoreSql("d.title", "d.policy_area", "s.bioguide_id");
    expect(sql).toContain("LEFT JOIN bill_digests d");
    expect(sql).toContain("FROM bill_sponsors");
    expect(sql).toContain(scoreSql);
    expect(sql).toContain(`${scoreSql} DESC, l.introduced_date DESC, l.bill_number DESC`);
    expect(sql).toContain("LIMIT ?");
    expect(INTRO_FEED_MAX_NEW).toBe(12);
  });

  it("keeps an older high-score intro in the persist/feed cap when newer low-score intros arrive", () => {
    const newerLow = Array.from({ length: 12 }, (_, i) => ({
      title: "A bill to amend title 5, United States Code",
      policyArea: null,
      primarySponsorBioguide: null,
      introducedDate: "2026-09-03",
      number: i + 1,
    }));
    const olderAsi = {
      title: "Ban Artificial Superintelligence Act",
      policyArea: "Science, Technology, Communications",
      primarySponsorBioguide: "S000033",
      introducedDate: "2026-09-01",
      number: 9901,
    };
    const kept = selectIntroPersistSet([...newerLow, olderAsi], INTRO_FEED_MAX_NEW);
    expect(kept).toHaveLength(12);
    expect(kept[0]).toMatchObject({ number: 9901, title: "Ban Artificial Superintelligence Act" });
    expect(kept.some((bill) => bill.number === 9901)).toBe(true);
    expect(kept.filter((bill) => /to amend title 5/i.test(bill.title ?? "")).length).toBe(11);
  });

  it("read-path SQL keeps an older high-score intro when newer low-score intros fill the date slot", () => {
    const genericRows = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return `INSERT INTO bill_lifecycle (congress, bill_type, bill_number, introduced_date) VALUES (119, 'HR', ${n}, '2026-09-03');
INSERT INTO bill_digests (congress, bill_type, number, title, policy_area) VALUES (119, 'HR', ${n}, 'A bill to amend title 5, United States Code', NULL);`;
    }).join("\n");
    const setupSql = `
      CREATE TABLE bill_lifecycle (
        congress INTEGER NOT NULL,
        bill_type TEXT NOT NULL,
        bill_number INTEGER NOT NULL,
        introduced_date TEXT
      );
      CREATE TABLE bill_digests (
        congress INTEGER NOT NULL,
        bill_type TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT,
        policy_area TEXT
      );
      CREATE TABLE bill_sponsors (
        congress INTEGER NOT NULL,
        bill_type TEXT NOT NULL,
        bill_number INTEGER NOT NULL,
        bioguide_id TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE votes (
        is_passage INTEGER NOT NULL,
        bill_congress INTEGER NOT NULL,
        bill_type TEXT NOT NULL,
        bill_number INTEGER NOT NULL
      );
      ${genericRows}
      INSERT INTO bill_lifecycle (congress, bill_type, bill_number, introduced_date) VALUES (119, 'S', 9901, '2026-09-01');
      INSERT INTO bill_digests (congress, bill_type, number, title, policy_area)
        VALUES (119, 'S', 9901, 'Ban Artificial Superintelligence Act', 'Science, Technology, Communications');
      INSERT INTO bill_sponsors (congress, bill_type, bill_number, bioguide_id, is_primary)
        VALUES (119, 'S', 9901, 'S000033', 1);
    `;
    const rows = querySqliteJson(
      setupSql,
      bindSql(introOnlyMembershipSql(), ["2026-08-28", INTRO_FEED_MAX_NEW])
    );
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ bill_type: "S", bill_number: 9901 });
    expect(rows.some((row) => row.bill_number === 9901)).toBe(true);
  });
});

