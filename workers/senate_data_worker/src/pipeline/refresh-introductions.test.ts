import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";

const mockFetchRecentIntroducedBills = vi.fn();
const mockUpsertLifecycle = vi.fn();
const mockGetDigest = vi.fn();
const mockUpsertDigest = vi.fn();

vi.mock("../sources/introduced-bills", () => ({
  fetchRecentIntroducedBills: (...args: unknown[]) => mockFetchRecentIntroducedBills(...args),
}));

vi.mock("../d1/lifecycle", () => ({
  upsertLifecycle: (...args: unknown[]) => mockUpsertLifecycle(...args),
}));

vi.mock("../d1/digests", () => ({
  getDigest: (...args: unknown[]) => mockGetDigest(...args),
  upsertDigest: (...args: unknown[]) => mockUpsertDigest(...args),
}));

import { persistRecentIntroductions } from "./refresh-introductions";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

describe("persistRecentIntroductions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertLifecycle.mockResolvedValue(undefined);
    mockGetDigest.mockResolvedValue(null);
    mockUpsertDigest.mockResolvedValue(undefined);
  });

  it("upserts lifecycle and a title stub for new intros", async () => {
    mockFetchRecentIntroducedBills.mockResolvedValue([
      {
        congress: 119,
        type: "S",
        number: 9901,
        title: "Ban Artificial Superintelligence Act",
        introducedDate: "2026-09-03",
        latestActionDate: "2026-09-03",
        latestActionText: "Introduced in Senate",
      },
    ]);

    const result = await persistRecentIntroductions(createEnv(), 119, "admin");

    expect(result.discovered).toBe(1);
    expect(result.persisted).toBe(1);
    expect(result.bills).toEqual([
      { bill_congress: 119, bill_type: "S", bill_number: 9901 },
    ]);
    expect(mockUpsertLifecycle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        congress: 119,
        billType: "S",
        billNumber: 9901,
        introducedDate: "2026-09-03",
      })
    );
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        congress: 119,
        billType: "S",
        number: 9901,
        title: "Ban Artificial Superintelligence Act",
        digest: null,
      })
    );
  });

  it("does not overwrite an existing digest title stub", async () => {
    mockFetchRecentIntroducedBills.mockResolvedValue([
      {
        congress: 119,
        type: "S",
        number: 9901,
        title: "Ban Artificial Superintelligence Act",
        introducedDate: "2026-09-03",
        latestActionDate: "2026-09-03",
        latestActionText: "Introduced in Senate",
      },
    ]);
    mockGetDigest.mockResolvedValue({
      congress: 119,
      bill_type: "S",
      number: 9901,
      title: "Existing",
      policy_area: null,
      raw_summary_text: null,
      digest_json: null,
    });

    await persistRecentIntroductions(createEnv(), 119, "scheduled");
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });

  it("returns warnings when the list fetch fails", async () => {
    mockFetchRecentIntroducedBills.mockRejectedValue(new Error("HTTP 429"));
    const result = await persistRecentIntroductions(createEnv(), 119, "admin");
    expect(result.bills).toEqual([]);
    expect(result.warnings[0]).toContain("HTTP 429");
  });
});
