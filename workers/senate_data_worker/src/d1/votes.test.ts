import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANION_VOTES_PER_BILL } from "../constants";
import { feedMembershipCteSql } from "./feed-membership";
import {
  countFeedBills,
  getCompanionVotesForBills,
  selectExistingVoteKeys,
  selectFeedBills,
  upsertNonPassageVoteStub,
} from "./votes";
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

  it("returns vote keys for passage and detailed non-passage rolls in the lookback window", async () => {
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
    // Non-passage stubs count as known, so their details are not re-fetched daily.
    expect(selectSql).toMatch(/is_passage = 1 OR/);
  });

  it("treats question-less non-passage stubs as unknown so they are refilled once", async () => {
    const { db, preparedSql } = createMockDb([]);

    await selectExistingVoteKeys(db, "2026-05-01", 119);

    const selectSql = preparedSql.find((sql) => sql.includes("FROM votes"))!;
    expect(selectSql).toMatch(/TRIM\(question\)\s*<>\s*''/);
  });
});

describe("upsertNonPassageVoteStub", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("stores question and tallies and backfills earlier question-less stubs", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);

    await upsertNonPassageVoteStub(db, {
      chamber: "House",
      congress: 119,
      session: 2,
      rollNumber: 249,
      bill: { congress: 119, type: "hr", number: 7008 },
      question: "On Motion to Recommit",
      result: "Failed",
      yeas: 209,
      nays: 217,
      voteDate: "2026-05-12",
    });

    const insertSql = preparedSql.find((sql) => sql.includes("INSERT INTO votes"))!;
    expect(insertSql).toContain("DO UPDATE SET");
    expect(insertSql).toMatch(/question = excluded\.question/);
    expect(insertSql).toMatch(/yeas = excluded\.yeas/);
    expect(bindsBySql.get(insertSql)).toEqual([
      "House",
      119,
      2,
      249,
      119,
      "HR",
      7008,
      "On Motion to Recommit",
      "Failed",
      209,
      217,
      "2026-05-12",
    ]);
  });

  it("strips Senate LIS <measure> tags before storing companion questions", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);

    await upsertNonPassageVoteStub(db, {
      chamber: "Senate",
      congress: 119,
      session: 2,
      rollNumber: 227,
      bill: { congress: 119, type: "hr", number: 6500 },
      question: "On the Motion to Table <measure>S.Amdt. 6747</measure>",
      result: "Agreed to",
      yeas: 52,
      nays: 45,
      voteDate: "2026-08-08",
    });

    const insertSql = preparedSql.find((sql) => sql.includes("INSERT INTO votes"))!;
    expect(bindsBySql.get(insertSql)).toEqual([
      "Senate",
      119,
      2,
      227,
      119,
      "HR",
      6500,
      "On the Motion to Table S.Amdt. 6747",
      "Agreed to",
      52,
      45,
      "2026-08-08",
    ]);
  });

  it("never overwrites a passage row that shares the roll-call key", async () => {
    const { db, preparedSql } = createMockDb([]);

    await upsertNonPassageVoteStub(db, {
      chamber: "Senate",
      congress: 119,
      session: 2,
      rollNumber: 163,
      bill: { congress: 119, type: "s", number: 2 },
      question: "On the Motion to Table",
      result: "Agreed to",
      yeas: 51,
      nays: 47,
      voteDate: "2026-05-12",
    });

    const insertSql = preparedSql.find((sql) => sql.includes("INSERT INTO votes"))!;
    expect(insertSql).toMatch(/WHERE votes\.is_passage = 0/);
  });
});

describe("getCompanionVotesForBills", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("returns only detailed non-passage rolls, newest first, keyed by bill", async () => {
    const { db, preparedSql } = createMockDb([
      {
        chamber: "House",
        congress: 119,
        session: 2,
        roll_number: 249,
        question: "On Motion to Recommit",
        result: "Failed",
        yeas: 209,
        nays: 217,
        vote_date: "2026-05-12",
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 7008,
      },
    ]);

    const map = await getCompanionVotesForBills(db, [
      { congress: 119, billType: "hr", billNumber: 7008 },
    ]);

    const selectSql = preparedSql.find((sql) => sql.includes("FROM votes"))!;
    expect(selectSql).toMatch(/is_passage = 0/);
    expect(selectSql).toMatch(/TRIM\(question\)\s*<>\s*''/);
    expect(selectSql).toMatch(/\(yeas \+ nays\) > 0/);
    expect(selectSql).toMatch(/ORDER BY vote_date DESC, roll_number DESC/);
    expect(map.get("119:HR:7008")).toEqual([
      expect.objectContaining({ roll_number: 249, question: "On Motion to Recommit" }),
    ]);
  });

  it("unwraps stored <measure> tags so existing companion rows are safe to show", async () => {
    const { db } = createMockDb([
      {
        chamber: "Senate",
        congress: 119,
        session: 2,
        roll_number: 227,
        question: "On the Motion to Table <measure>S.Amdt. 6747</measure>",
        result: "Agreed to",
        yeas: 52,
        nays: 45,
        vote_date: "2026-08-08",
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 6500,
      },
    ]);

    const map = await getCompanionVotesForBills(db, [
      { congress: 119, billType: "hr", billNumber: 6500 },
    ]);

    expect(map.get("119:HR:6500")).toEqual([
      expect.objectContaining({
        roll_number: 227,
        question: "On the Motion to Table S.Amdt. 6747",
      }),
    ]);
  });

  it("returns an empty list for bills with no companion rolls", async () => {
    const { db } = createMockDb([]);

    const map = await getCompanionVotesForBills(db, [
      { congress: 119, billType: "hr", billNumber: 1 },
    ]);

    expect(map.get("119:HR:1")).toEqual([]);
  });

  it("bounds companion rolls per bill in SQL and keeps the newest ones", async () => {
    const makeRoll = (
      billNumber: number,
      rollNumber: number,
      voteDate: string
    ): Record<string, unknown> => ({
      chamber: "House",
      congress: 119,
      session: 2,
      roll_number: rollNumber,
      question: `On Motion ${rollNumber}`,
      result: "Failed",
      yeas: 200,
      nays: 220,
      vote_date: voteDate,
      bill_congress: 119,
      bill_type: "HR",
      bill_number: billNumber,
    });

    // Newest-first order mirrors the SQL ORDER BY; more than the cap per bill.
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < COMPANION_VOTES_PER_BILL + 4; i++) {
      rows.push(makeRoll(7008, 300 - i, `2026-05-${String(20 - i).padStart(2, "0")}`));
    }
    for (let i = 0; i < COMPANION_VOTES_PER_BILL + 3; i++) {
      rows.push(makeRoll(1, 100 - i, `2026-04-${String(20 - i).padStart(2, "0")}`));
    }

    const { db, preparedSql } = createMockDb(rows);

    const map = await getCompanionVotesForBills(db, [
      { congress: 119, billType: "hr", billNumber: 7008 },
      { congress: 119, billType: "hr", billNumber: 1 },
    ]);

    const selectSql = preparedSql.find((sql) => sql.includes("FROM votes"))!;
    expect(selectSql).toMatch(
      /ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY bill_congress,\s*UPPER\(bill_type\),\s*bill_number/
    );
    expect(selectSql).toMatch(
      new RegExp(`WHERE rn <= ${COMPANION_VOTES_PER_BILL}`)
    );
    expect(selectSql).toMatch(
      /ORDER BY vote_date DESC, roll_number DESC/
    );

    const bill7008 = map.get("119:HR:7008")!;
    const bill1 = map.get("119:HR:1")!;
    expect(bill7008).toHaveLength(COMPANION_VOTES_PER_BILL);
    expect(bill1).toHaveLength(COMPANION_VOTES_PER_BILL);
    expect(bill7008.map((r) => r.roll_number)).toEqual(
      Array.from({ length: COMPANION_VOTES_PER_BILL }, (_, i) => 300 - i)
    );
    expect(bill1.map((r) => r.roll_number)).toEqual(
      Array.from({ length: COMPANION_VOTES_PER_BILL }, (_, i) => 100 - i)
    );
  });
});

describe("selectFeedBills / countFeedBills chamber + q filters", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("omits chamber/q filters when not provided", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", 50, 0);
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24");

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
      "2026-06-24",
      20,
      50,
      0,
    ]);
    expect(bindsBySql.get(countSql!)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      20,
    ]);
    expect(selectSql!.startsWith(feedMembershipCteSql())).toBe(true);
    expect(countSql!.startsWith(feedMembershipCteSql())).toBe(true);
  });

  it("omits the intro UNION arm when includeIntros is false", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(
      db,
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      50,
      0,
      {},
      false
    );
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", {}, false);

    const selectSql = preparedSql.find((sql) => sql.includes("LIMIT ? OFFSET ?"))!;
    const countSql = preparedSql.find((sql) => sql.includes("SELECT COUNT(*) AS total"))!;
    expect(selectSql).not.toContain("bill_lifecycle");
    expect(selectSql).not.toContain("'intro' AS source");
    expect(countSql).not.toContain("bill_lifecycle");
    expect(selectSql.startsWith(feedMembershipCteSql(false))).toBe(true);
    expect(bindsBySql.get(selectSql)).toEqual(["2026-05-01", "2026-06-01T00:00:00.000Z", 50, 0]);
    expect(bindsBySql.get(countSql)).toEqual(["2026-05-01", "2026-06-01T00:00:00.000Z"]);
  });

  it("adds vote-chamber EXISTS or intro-source origin types", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([
      {
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 1,
        latest_passage_date: "2026-06-10",
        latest_activity_date: "2026-06-10",
      },
    ]);
    await selectFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", 10, 5, {
      chamber: "House",
    });
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", {
      chamber: "Senate",
    });

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    );
    const countSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("SELECT COUNT(*) AS total")
    );
    expect(selectSql).toContain("v.is_passage = 1");
    expect(selectSql).toContain("v.chamber = ?");
    expect(selectSql).toContain("EXISTS");
    expect(selectSql).toContain("source = 'intro'");
    expect(countSql).toContain("v.is_passage = 1");
    expect(countSql).toContain("v.chamber = ?");
    expect(countSql).toContain("source = 'intro'");
    expect(bindsBySql.get(selectSql!)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      20,
      "House",
      10,
      5,
    ]);
    expect(bindsBySql.get(countSql!)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      20,
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
      "2026-06-24",
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
      /MAX\s*\(\s*CASE\s+WHEN\s+source\s*=\s*'vote'\s+THEN\s+sort_date\s+END\s*\)\s+AS\s+latest_passage_date/i
    );
    expect(selectSql).toContain("'intro' AS source");
    expect(selectSql).toContain("NOT EXISTS");
    expect(selectSql).toMatch(/MAX\s*\(\s*sort_date\s*\)\s+AS\s+latest_activity_date/i);
    expect(selectSql).toMatch(/ORDER BY\s+latest_activity_date\s+DESC/i);
    expect(selectSql).not.toMatch(/ORDER BY\s+latest_passage_date\s+DESC/i);
  });

  it("adds sponsor-state EXISTS and binds state for select and count", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", 10, 0, {
      state: "NY",
    });
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", { state: "NY" });

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    )!;
    const countSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("SELECT COUNT(*) AS total")
    )!;
    expect(selectSql).toContain("bill_sponsors");
    expect(selectSql).toContain("s.is_primary = 1");
    expect(selectSql).toContain("s.state = ?");
    expect(bindsBySql.get(selectSql)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      20,
      "NY",
      10,
      0,
    ]);
    expect(bindsBySql.get(countSql)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      20,
      "NY",
    ]);
  });

  it("adds q search binds for title/policy/headline/bill-id and keeps executive UNION ALL", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", 20, 0, {
      q: "hr1",
    });
    await countFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", { q: "hr1" });

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    )!;
    const countSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("SELECT COUNT(*) AS total")
    )!;
    expect(selectSql).toContain("UNION ALL");
    expect(selectSql).toContain("'vote' AS source");
    expect(selectSql).toContain("'executive' AS source");
    expect(selectSql).toContain("bill_lifecycle");
    expect(selectSql).toContain("introduced_date");
    expect(selectSql).toContain("bill_digests");
    expect(selectSql).toContain("$.headline");
    expect(bindsBySql.get(selectSql)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      20,
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
      "2026-06-24",
      20,
      "%hr1%",
      "%hr1%",
      "%hr1%",
      "hr1%",
    ]);
  });

  it("ANDs chamber with q and escapes LIKE wildcards in q", async () => {
    const { db, preparedSql, bindsBySql } = createMockDb([]);
    await selectFeedBills(db, "2026-05-01", "2026-06-01T00:00:00.000Z", "2026-06-24", 5, 0, {
      chamber: "Senate",
      q: "100%",
    });

    const selectSql = preparedSql.find(
      (sql) => sql.includes("WITH combined AS") && sql.includes("LIMIT ? OFFSET ?")
    )!;
    expect(selectSql).toContain("v.chamber = ?");
    expect(selectSql).toContain(" AND ");
    expect(bindsBySql.get(selectSql)).toEqual([
      "2026-05-01",
      "2026-06-01T00:00:00.000Z",
      "2026-06-24",
      20,
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
