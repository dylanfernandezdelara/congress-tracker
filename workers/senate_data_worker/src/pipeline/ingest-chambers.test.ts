import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";

const mockIngestHousePassageVotes = vi.fn();
const mockIngestSenatePassageVotes = vi.fn();

vi.mock("../sources/house-votes", () => ({
  ingestHousePassageVotes: (...args: unknown[]) => mockIngestHousePassageVotes(...args),
}));

vi.mock("../sources/senate-votes", () => ({
  ingestSenatePassageVotes: (...args: unknown[]) => mockIngestSenatePassageVotes(...args),
}));

import { ingestPassageVotesByChamber } from "./ingest-chambers";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

describe("ingestPassageVotesByChamber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns both chambers when both succeed", async () => {
    mockIngestHousePassageVotes.mockResolvedValue({ votes: [{ chamber: "House" }], skipped: 1 });
    mockIngestSenatePassageVotes.mockResolvedValue({ votes: [{ chamber: "Senate" }], skipped: 2 });

    const result = await ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set());

    expect(result.house.votes).toHaveLength(1);
    expect(result.senate.votes).toHaveLength(1);
    expect(result.chamberWarnings).toEqual([]);
  });

  it("continues with House votes when Senate ingest fails", async () => {
    mockIngestHousePassageVotes.mockResolvedValue({ votes: [{ chamber: "House" }], skipped: 0 });
    mockIngestSenatePassageVotes.mockRejectedValue(
      new Error("HTTP 403 for https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml")
    );

    const result = await ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set());

    expect(result.house.votes).toHaveLength(1);
    expect(result.senate.votes).toEqual([]);
    expect(result.chamberWarnings[0]).toContain("Senate ingest skipped");
    expect(result.chamberWarnings[0]).toContain("403");
  });

  it("continues with Senate votes when House ingest fails", async () => {
    mockIngestHousePassageVotes.mockRejectedValue(new Error("Congress API down"));
    mockIngestSenatePassageVotes.mockResolvedValue({ votes: [{ chamber: "Senate" }], skipped: 0 });

    const result = await ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set());

    expect(result.house.votes).toEqual([]);
    expect(result.senate.votes).toHaveLength(1);
    expect(result.chamberWarnings[0]).toContain("House ingest skipped");
    expect(result.chamberWarnings[0]).toContain("Congress API down");
  });

  it("throws when both chambers fail", async () => {
    mockIngestHousePassageVotes.mockRejectedValue(new Error("House down"));
    mockIngestSenatePassageVotes.mockRejectedValue(new Error("Senate down"));

    await expect(ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set())).rejects.toThrow(
      /House ingest failed: House down; Senate ingest failed: Senate down/
    );
  });

  it("warns when House ingest hits the per-run fetch cap", async () => {
    mockIngestHousePassageVotes.mockResolvedValue({
      votes: [{ chamber: "House" }],
      skipped: 0,
      truncated: true,
      sourceLatestDate: "2026-07-23",
      coveredLatestDate: "2026-07-23",
    });
    mockIngestSenatePassageVotes.mockResolvedValue({ votes: [], skipped: 0, confirmationVotes: [] });

    const result = await ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set());

    expect(result.chamberWarnings).toEqual([
      "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first).",
    ]);
  });

  it("pages source-ahead House dates as a chamber warning", async () => {
    mockIngestHousePassageVotes.mockResolvedValue({
      votes: [],
      skipped: 0,
      sourceLatestDate: "2026-08-10",
      coveredLatestDate: "2026-07-23",
    });
    mockIngestSenatePassageVotes.mockResolvedValue({
      votes: [],
      skipped: 0,
      confirmationVotes: [],
      sourceLatestDate: "2026-08-08",
      coveredLatestDate: "2026-08-08",
    });

    const result = await ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set());

    expect(result.chamberWarnings).toEqual([
      "House source listed latest 2026-08-10 is newer than stored 2026-07-23",
    ]);
  });

  it("collects integrity warnings from both chambers", async () => {
    mockIngestHousePassageVotes.mockResolvedValue({
      votes: [],
      skipped: 0,
      truncated: true,
      sourceLatestDate: "2026-07-23",
      coveredLatestDate: "2026-07-23",
    });
    mockIngestSenatePassageVotes.mockResolvedValue({
      votes: [],
      skipped: 0,
      confirmationVotes: [],
      sourceLatestDate: "2026-08-10",
      coveredLatestDate: "2026-08-01",
    });

    const result = await ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set());

    expect(result.chamberWarnings).toEqual([
      "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first).",
      "Senate source listed latest 2026-08-10 is newer than stored 2026-08-01",
    ]);
  });
});
