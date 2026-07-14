import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { LifecycleRow } from "../d1/lifecycle";

const mockEnsureSchema = vi.fn();
const mockCountFeedBills = vi.fn();
const mockSelectFeedBills = vi.fn();
const mockGetDigest = vi.fn();
const mockGetPassageVotesForBill = vi.fn();
const mockGetExecutivePostBillsForBill = vi.fn();
const mockGetExecutivePostBillsForPost = vi.fn();
const mockGetLifecyclesForBills = vi.fn();
const mockLookbackStartIso = vi.fn((days: number) => `lookback-${days}`);

vi.mock("../d1/schema", () => ({
  ensureSchema: (...args: unknown[]) => mockEnsureSchema(...args),
}));

vi.mock("../d1/votes", () => ({
  countFeedBills: (...args: unknown[]) => mockCountFeedBills(...args),
  selectFeedBills: (...args: unknown[]) => mockSelectFeedBills(...args),
  getPassageVotesForBill: (...args: unknown[]) => mockGetPassageVotesForBill(...args),
}));

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: (...args: unknown[]) => mockGetDigest(...args),
  };
});

vi.mock("../d1/executive", () => ({
  getExecutivePostBillsForBill: (...args: unknown[]) => mockGetExecutivePostBillsForBill(...args),
  getExecutivePostBillsForPost: (...args: unknown[]) => mockGetExecutivePostBillsForPost(...args),
  toExecutiveSignal: (post: { id: string; posted_at: string; summary: string; text: string; source_url: string }) => ({
    post_id: post.id,
    posted_at: post.posted_at,
    summary: post.summary,
    quote: post.text,
    source_url: post.source_url,
    informal: true,
  }),
}));

vi.mock("../d1/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/lifecycle")>();
  return {
    ...actual,
    getLifecyclesForBills: (...args: unknown[]) => mockGetLifecyclesForBills(...args),
  };
});

vi.mock("../sources/congress-client", () => ({
  lookbackStartIso: (days: number) => mockLookbackStartIso(days),
}));

import { buildFeedPage } from "./feed";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

const hr6644Lifecycle: LifecycleRow = {
  congress: 119,
  bill_type: "HR",
  bill_number: 6644,
  introduced_date: "2025-12-11",
  presented_date: "2026-06-29",
  signed_date: null,
  vetoed_date: null,
  became_law_date: null,
  law_kind: null,
  public_law: null,
  latest_action_date: "2026-06-29",
  latest_action_text: "Presented to President.",
  updated_at: "2026-07-01T00:00:00.000Z",
};

describe("buildFeedPage lifecycle attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureSchema.mockResolvedValue(undefined);
    mockCountFeedBills.mockResolvedValue(1);
    mockSelectFeedBills.mockResolvedValue([
      {
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 6644,
        latest_passage_date: "2026-06-22",
      },
    ]);
    mockGetDigest.mockResolvedValue({
      congress: 119,
      bill_type: "HR",
      number: 6644,
      title: "21st Century ROAD to Housing Act",
      policy_area: "Housing",
      raw_summary_text: null,
      digest_json: null,
    });
    mockGetPassageVotesForBill.mockResolvedValue([]);
    mockGetExecutivePostBillsForBill.mockResolvedValue([]);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([["119:HR:6644", hr6644Lifecycle]])
    );
  });

  it("attaches pending lifecycle with ten-day derivation (bulk read)", async () => {
    const page = await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      now: "2026-07-03",
    });

    expect(mockGetLifecyclesForBills).toHaveBeenCalledOnce();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.lifecycle).toEqual({
      introduced_date: "2025-12-11",
      presented_date: "2026-06-29",
      signed_date: null,
      vetoed_date: null,
      became_law_date: null,
      law_kind: null,
      public_law: null,
      latest_action_date: "2026-06-29",
      latest_action_text: "Presented to President.",
      derived: {
        status: "pending_signature",
        day_of_ten: 4,
        deadline_date: "2026-07-10",
        becomes_law_on: "2026-07-11",
      },
    });
  });

  it("derives law_unsigned after the ten-day window lapses", async () => {
    const page = await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      now: "2026-07-11",
    });

    expect(page.items[0]?.lifecycle?.derived).toEqual({
      status: "law_unsigned_derived",
      day_of_ten: null,
      deadline_date: "2026-07-10",
      becomes_law_on: "2026-07-11",
    });
  });

  it("sets lifecycle null when no stored row exists", async () => {
    mockGetLifecyclesForBills.mockResolvedValue(new Map());
    const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0 });
    expect(page.items[0]?.lifecycle).toBeNull();
  });
});
