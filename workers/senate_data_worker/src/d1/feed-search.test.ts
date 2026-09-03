import { describe, expect, it } from "vitest";
import {
  buildFeedFilterClause,
  escapeLikePattern,
  normalizeFeedSearchQuery,
  stripBillIdQuery,
} from "./feed-search";

describe("normalizeFeedSearchQuery", () => {
  it("returns undefined for null, absent, empty, and whitespace-only", () => {
    expect(normalizeFeedSearchQuery(null)).toBeUndefined();
    expect(normalizeFeedSearchQuery(undefined)).toBeUndefined();
    expect(normalizeFeedSearchQuery("")).toBeUndefined();
    expect(normalizeFeedSearchQuery("   \t")).toBeUndefined();
  });

  it("trims and silently truncates to 100 chars", () => {
    expect(normalizeFeedSearchQuery("  housing  ")).toBe("housing");
    const long = "a".repeat(150);
    expect(normalizeFeedSearchQuery(long)).toBe("a".repeat(100));
  });
});

describe("stripBillIdQuery / escapeLikePattern", () => {
  it("normalizes bill id queries (hr1, H.R. 1, hr 1)", () => {
    expect(stripBillIdQuery("hr1").toLowerCase()).toBe("hr1");
    expect(stripBillIdQuery("H.R. 1").toLowerCase()).toBe("hr1");
    expect(stripBillIdQuery("hr 1").toLowerCase()).toBe("hr1");
  });

  it("escapes LIKE wildcards for literal matching", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });
});

describe("buildFeedFilterClause", () => {
  it("omits WHERE when filters are absent", () => {
    expect(buildFeedFilterClause({})).toEqual({ sql: "", binds: [] });
  });

  it("filters by primary sponsor state", () => {
    const { sql, binds } = buildFeedFilterClause({ state: "NY" });
    expect(sql).toContain("bill_sponsors");
    expect(sql).toContain("s.is_primary = 1");
    expect(sql).toContain("s.state = ?");
    expect(sql).not.toContain("LEFT JOIN members");
    expect(binds).toEqual(["NY"]);
  });

  it("combines state, sponsor chamber, party, and name in one EXISTS", () => {
    const { sql, binds } = buildFeedFilterClause({
      state: "NY",
      sponsorChamber: "Senate",
      party: "D",
      sponsorQ: "Schumer",
    });
    expect(sql).toContain("LEFT JOIN members m");
    expect(sql).toContain("s.state = ?");
    expect(sql).toContain("m.chamber = ?");
    expect(sql).toContain("LOWER(s.full_name) LIKE ?");
    expect(sql).toContain("LOWER(m.name) LIKE ?");
    expect(sql).toContain("IN (?, ?, ?, ?)");
    expect(binds[0]).toBe("NY");
    expect(binds[1]).toBe("Senate");
    expect(binds[2]).toBe("%schumer%");
    expect(binds[3]).toBe("%schumer%");
    expect(binds.slice(4)).toEqual(["D", "DEM", "DEMOCRAT", "DEMOCRATIC"]);
  });

  it("filters by exact sponsor bioguide and policy area", () => {
    const { sql, binds } = buildFeedFilterClause({
      sponsor: "A000001",
      policy: "Energy",
    });
    expect(sql).toContain("s.bioguide_id = ?");
    expect(sql).toContain("d.policy_area = ?");
    expect(binds).toEqual(["A000001", "Energy"]);
  });

  it("builds title/policy/headline + bill-id match with case-insensitive LIKE", () => {
    const { sql, binds } = buildFeedFilterClause({ q: "Housing" });
    expect(sql).toContain("LOWER(d.title) LIKE ? ESCAPE '\\'");
    expect(sql).toContain("LOWER(d.policy_area) LIKE ? ESCAPE '\\'");
    expect(sql).toContain("$.headline");
    expect(sql).toContain("json_valid(d.digest_json) = 1");
    expect(sql).toContain(
      "LOWER(combined.bill_type || CAST(combined.bill_number AS TEXT)) LIKE ? ESCAPE '\\'"
    );
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("bill_digests");
    expect(binds).toEqual(["%housing%", "%housing%", "%housing%", "housing%"]);
  });

  it("matches normalized bill ids (hr1 → hr1% prefix)", () => {
    const { binds } = buildFeedFilterClause({ q: "H.R. 1" });
    expect(binds[3]).toBe("hr1%");
  });

  it("escapes % in user query so LIKE matches literally", () => {
    const { binds } = buildFeedFilterClause({ q: "100%" });
    expect(binds[0]).toBe("%100\\%%");
    expect(binds[1]).toBe("%100\\%%");
    expect(binds[2]).toBe("%100\\%%");
    // Non-alphanumerics stripped from bill-id arm → "100"
    expect(binds[3]).toBe("100%");
  });

  it("combines chamber and q with AND", () => {
    const { sql, binds } = buildFeedFilterClause({ chamber: "House", q: "hr1" });
    expect(sql.startsWith("WHERE ")).toBe(true);
    expect(sql).toContain(" AND ");
    expect(sql).toContain("v.is_passage = 1");
    expect(sql).toContain("v.chamber = ?");
    expect(sql).toContain("('HR','HRES','HJRES','HCONRES')");
    expect(sql).toContain("source = 'intro'");
    expect(sql).not.toContain("NOT EXISTS");
    expect(binds[0]).toBe("House");
    expect(binds.slice(1)).toEqual(["%hr1%", "%hr1%", "%hr1%", "hr1%"]);
  });

  it("combines chamber, state, and q with AND", () => {
    const { sql, binds } = buildFeedFilterClause({
      chamber: "House",
      state: "NY",
      q: "hr1",
    });
    expect(sql).toContain("v.chamber = ?");
    expect(sql).toContain("bill_sponsors");
    expect(sql).toContain("bill_digests");
    expect(binds[0]).toBe("House");
    expect(binds[1]).toBe("NY");
    expect(binds.slice(2)).toEqual(["%hr1%", "%hr1%", "%hr1%", "hr1%"]);
  });

  it("skips bill-id arm when stripped query is empty", () => {
    const { sql, binds } = buildFeedFilterClause({ q: "!!!" });
    expect(sql).not.toContain("bill_type || CAST");
    expect(binds).toHaveLength(3);
  });
});
