import { beforeEach, describe, expect, it, vi } from "vitest";
import { countFeedBills, selectExistingVoteKeys, selectFeedBills } from "./votes";
import { resetSchemaFlag } from "./schema";

function createMockDb(rows: Array<Record<string, unknown>>): {
  db: D1Database;
  preparedSql: string[];
  bindsBySql: Map<string, unknown[]>;
} {
  const preparedSql: string[] = [];
  const bindsBySql = new Map<string, unknown[]>();
  const runResult = { success: true, meta: { duration: 0, changes: 1 } };
  const stmt = (sql: string) => {
    preparedSql.push(sql);
    const bound = {
      bind: vi.fn((...args: unknown[]) => {
        bindsBySql.set(sql, args);
        return bound;
      }),
      all: vi.fn(async () => ({ results: rows })),
      first: vi.fn(async () => ({ total: rows.length })),
      run: vi.fn(async () => runResult),
    };
    return bound;
  };
  return {
    preparedSql,
    bindsBySql,
    db: {
      exec: vi.fn(async () => {}),
      prepare: vi.fn((sql: string) => stmt(sql)),
    } as unknown as D1Database,
  };
}

describe("selectExistingVoteKeys", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("returns vote keys for passage and non-passage rolls in the lookback window", async () => {
    const { db, preparedSql } = createMockDb([
      { chamber: "House", congress: 119, session: 2, roll_number: 10 },
      { chamber: "House", congress: 119, session: 2, roll_number: 11 },
      { chamber: "Senate", congress: 119, session: 2, roll_number: 163 },
    ]);

    const keys = await selectExistingVoteKeys(db, "2026-05-01", 119);

    expect(keys).toEqual(
      new Set(["House:119:2:10", "House:119:2:11", "Senate:119:2:163"])
    );
    const selectSql = preparedSql.find((sql) => sql.includes("FROM votes"));
    expect(selectSql).toBeDefined();
    expect(selectSql).not.toMatch(/is_passage\s*=\s*1/);
  });
});

describe("selectFeedBills / countFeedBills chamber + q filters", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("omits chamber/q filters when not provided", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", 50, 0);
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z");

    const feedSql = preparedSql.filter((s) => s.includes("WITH combined AS"));
    expect(feedSql.length).toBeGreaterThanOrEqual(2);
    for (const sql of feedSql) {
      expect(sql).not.toContain("v.chamber = ?");
      expect(sql).not.toContain("bill_digests");
      expect(sql).toMatch(/is_passage = 1/);
    }
    const selectSql = feedSql.find((sql) => sql.includes("LIMIT ? OFFSET ?"));
    const countSql = feedSql.find((sql) => sql.includes("SELECT COUNT(*) AS total"));
    expect(selectSql).toBeDefined();
    expect(countSql).toBeDefined();
    expect(bindsBySql.get(selectSql!)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      50,
      0,
    ]);
    expect(bindsBySql.get(countSql!)).toEqual(["2026-05-01", "2026-06-01T00:00:00.000Z"]);
  });

  it("adds passage-only chamber EXISTS and binds chamber for select and count", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([
      {
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 1,
        latest_passage_date: "2026-06-10",
        latest_activity_date: "2026-06-10",
      },
    ]);
    await selectFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", 10, 5, "House");
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "Senate");

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    );
    const countSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("SELECT COUNT(*) AS total")
    );
    expect(selectSql).toContain("v.is_passage = 1");
    expect(selectSql).toContain("v.chamber = ?");
    expect(selectSql).toContain("EXISTS");
    expect(countSql).toContain("v.is_passage = 1");
    expect(countSql).toContain("v.chamber = ?");
    expect(bindsBySql.get(selectSql!)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "House",
      10,
      5,
    ]);
    expect(bindsBySql.get(countSql!)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "Senate",
    ]);
  });

  it("separates vote-only latest_passage_date from activity sort date", async () => {
    const { db, preparedSql } = createMockDb([
      {
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 1,
        latest_passage_date: "2026-04-10",
        latest_activity_date: "2026-06-24T14:26:00.000Z",
      },
    ]);

    const rows = await selectFeedBills(
      db,
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      50,
      0
    );

    expect(rows[0]).toMatchObject({
      latest_passage_date: "2026-04-10",
      latest_activity_date: "2026-06-24T14:26:00.000Z",
    });

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    );
    expect(selectSql).toMatch(
      /MAX\s*\(\s*CASE\s+WHEN\s+executive_boost\s*=\s*0\s+THEN\s+sort_date\s+END\s*\)\s+AS\s+latest_passage_date/i
    );
    expect(selectSql).toMatch(/MAX\s*\(\s*sort_date\s*\)\s+AS\s+latest_activity_date/i);
    expect(selectSql).toMatch(/ORDER BY\s+latest_activity_date\s+DESC/i);
    expect(selectSql).not.toMatch(/ORDER BY\s+latest_passage_date\s+DESC/i);
  });

  it("adds q search binds for title/policy/headline/bill-id and keeps executive UNION ALL", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(
      db,
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      20,
      0,
      undefined,
      "hr1"
    );
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", undefined, "hr1");

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    )!;
    const countSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("SELECT COUNT(*) AS total")
    )!;
    expect(selectSql).toContain("UNION ALL");
    expect(selectSql).toContain("executive_boost");
    expect(selectSql).toContain("bill_digests");
    expect(selectSql).toContain("$.headline");
    expect(bindsBySql.get(selectSql)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "%hr1%",
      "%hr1%",
      "%hr1%",
      "hr1%",
      20,
      0,
    ]);
    expect(bindsBySql.get(countSql)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "%hr1%",
      "%hr1%",
      "%hr1%",
      "hr1%",
    ]);
  });

  it("ANDs chamber with q and escapes LIKE wildcards in q", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(
      db,
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      5,
      0,
      "Senate",
      "100%"
    );

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    )!;
    expect(selectSql).toContain("v.chamber = ?");
    expect(selectSql).toContain(" AND ");
    expect(bindsBySql.get(selectSql)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "Senate",
      "%100\\%%",
      "%100\\%%",
      "%100\\%%",
      "100%",
      5,
      0,
    ]);
  });
});
