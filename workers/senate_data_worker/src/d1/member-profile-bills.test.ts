import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTRO_FEED_MAX_NEW } from "../constants";
import {
  enrichRecentCrossVotesSql,
  inFeedBillKeysSql,
  sponsoredBillsCountSql,
  sponsoredBillsSelectSql,
} from "./member-profile-bills";
import { SCHEMA_DDL } from "./schema";

function bindSql(sql: string, values: Array<string | number>): string {
  let i = 0;
  return sql.replace(/\?/g, () => {
    const value = values[i++];
    if (value === undefined) throw new Error("missing SQL bind");
    return typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
  });
}

function querySqliteJson(setupSql: string, query: string): Array<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), "member-profile-bills-"));
  const dbPath = join(dir, "t.sqlite");
  try {
    execFileSync("sqlite3", [dbPath], { input: setupSql, encoding: "utf8" });
    const raw = execFileSync("sqlite3", ["-json", dbPath, query], { encoding: "utf8" }).trim();
    return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SCHEMA_SQL = SCHEMA_DDL.join(";\n") + ";";

const FIXTURE_SQL = `
${SCHEMA_SQL}
INSERT INTO votes (chamber, congress, session, roll_number, bill_congress, bill_type, bill_number, question, result, yeas, nays, vote_date, is_passage)
VALUES
  ('House', 119, 2, 10, 119, 'hr', 1, 'On Passage', 'Passed', 220, 213, '2026-09-07', 1),
  ('House', 119, 2, 11, 119, 's', 47, 'On Passage', 'Passed', 210, 200, '2026-09-06', 1),
  ('House', 119, 2, 12, 119, 'hr', 99, 'On Passage', 'Passed', 300, 100, '2026-06-01', 1);
INSERT INTO bill_digests (congress, bill_type, number, title, policy_area, raw_summary_text, digest_json, created_at, updated_at)
VALUES
  (119, 'hr', 1, 'Lower Energy Costs Act', 'Energy', '',
   '{"headline":"House passes a broad energy package"}', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
INSERT INTO bill_sponsors (congress, bill_type, bill_number, bioguide_id, state, full_name, party, is_primary, updated_at)
VALUES
  (119, 'hr', 22, 'F000466', 'PA', 'Brian Fitzpatrick', 'R', 1, '2026-08-01T00:00:00.000Z'),
  (119, 'hr', 33, 'F000466', 'PA', 'Brian Fitzpatrick', 'R', 1, '2026-08-02T00:00:00.000Z'),
  (119, 'hr', 44, 'F000466', 'PA', 'Brian Fitzpatrick', 'R', 1, '2026-08-03T00:00:00.000Z'),
  (119, 'hr', 55, 'F000466', 'PA', 'Brian Fitzpatrick', 'R', 1, '2026-08-04T00:00:00.000Z'),
  (119, 'hr', 66, 'F000466', 'PA', 'Brian Fitzpatrick', 'R', 1, '2026-08-05T00:00:00.000Z'),
  (119, 'hr', 77, 'F000466', 'PA', 'Brian Fitzpatrick', 'R', 1, '2026-08-06T00:00:00.000Z'),
  (119, 'hr', 88, 'F000466', 'PA', 'Brian Fitzpatrick', 'R', 0, '2026-08-07T00:00:00.000Z'),
  (119, 'hr', 1, 'A000001', 'CA', 'Other Member', 'D', 1, '2026-08-08T00:00:00.000Z');
INSERT INTO bill_lifecycle (congress, bill_type, bill_number, introduced_date, latest_action_text, updated_at)
VALUES
  (119, 'hr', 22, '2026-08-01', 'Referred to the House Committee on Oversight.', '2026-08-01T00:00:00.000Z'),
  (119, 'hr', 33, '2026-08-02', 'Received in the Senate.', '2026-08-02T00:00:00.000Z'),
  (119, 'hr', 44, '2026-08-03', NULL, '2026-08-03T00:00:00.000Z'),
  (119, 'hr', 55, '2026-08-04', 'Passed the House.', '2026-08-04T00:00:00.000Z'),
  (119, 'hr', 66, '2026-08-05', 'Introduced in House.', '2026-08-05T00:00:00.000Z'),
  (119, 'hr', 77, '2026-08-06', 'Introduced in House.', '2026-08-06T00:00:00.000Z'),
  (119, 'hr', 88, '2026-08-07', 'Cosponsored only.', '2026-08-07T00:00:00.000Z'),
  (119, 'hr', 99, '2026-06-01', 'Introduced in House.', '2026-06-01T00:00:00.000Z'),
  (119, 's', 9901, '2026-09-06', 'Introduced in Senate.', '2026-09-06T00:00:00.000Z');
INSERT INTO bill_digests (congress, bill_type, number, title, policy_area, raw_summary_text, digest_json, created_at, updated_at)
VALUES
  (119, 'hr', 77, 'Newest Sponsored Act', 'Energy', '',
   '{"headline":"Newest sponsored headline"}', '2026-08-06T00:00:00.000Z', '2026-08-06T00:00:00.000Z');
`;

describe("member profile bill SQL", () => {
  it("looks up multiple rolls with one OR-tuple and leaves missing digests empty", () => {
    const rows = querySqliteJson(
      FIXTURE_SQL,
      bindSql(enrichRecentCrossVotesSql(2), ["House", 119, 2, 10, "House", 119, 2, 11])
    );
    expect(rows).toHaveLength(2);
    const byRoll = new Map(rows.map((row) => [row.roll_number, row]));
    expect(byRoll.get(10)).toMatchObject({
      title: "Lower Energy Costs Act",
      headline: "House passes a broad energy package",
    });
    expect(byRoll.get(11)).toMatchObject({
      title: null,
      headline: null,
    });
  });

  it("counts only primary-sponsored bills and orders the limited list", () => {
    const countRows = querySqliteJson(
      FIXTURE_SQL,
      bindSql(sponsoredBillsCountSql(), ["F000466", 119])
    );
    expect(countRows[0]).toMatchObject({ total: 6 });

    const listed = querySqliteJson(
      FIXTURE_SQL,
      bindSql(sponsoredBillsSelectSql(), ["F000466", 119, 5])
    );
    expect(listed).toHaveLength(5);
    expect(listed.map((row) => row.bill_number)).toEqual([77, 66, 55, 44, 33]);
    expect(listed.some((row) => row.bill_number === 88)).toBe(false);
    expect(listed[0]).toMatchObject({
      title: "Newest Sponsored Act",
      headline: "Newest sponsored headline",
      latest_action_text: "Introduced in House.",
    });
  });

  it("marks in-window passage and intro bills and leaves older intros out", () => {
    const rows = querySqliteJson(
      FIXTURE_SQL,
      bindSql(inFeedBillKeysSql(3), [
        "2026-07-25",
        "2026-08-25",
        "2026-09-01",
        INTRO_FEED_MAX_NEW,
        119,
        "HR",
        1,
        119,
        "HR",
        99,
        119,
        "S",
        9901,
      ])
    );
    const keys = rows.map((row) => `${row.bill_type}-${row.bill_number}`).sort();
    expect(keys).toEqual(["HR-1", "S-9901"]);
  });
});
