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

  it("throws when House ingest fails", async () => {
    mockIngestHousePassageVotes.mockRejectedValue(new Error("Congress API down"));
    mockIngestSenatePassageVotes.mockResolvedValue({ votes: [], skipped: 0 });

    await expect(ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set())).rejects.toThrow(
      "House ingest failed"
    );
  });

  it("throws when both chambers fail", async () => {
    mockIngestHousePassageVotes.mockRejectedValue(new Error("House down"));
    mockIngestSenatePassageVotes.mockRejectedValue(new Error("Senate down"));

    await expect(ingestPassageVotesByChamber(createEnv(), "2026-05-01", new Set())).rejects.toThrow(
      "House ingest failed"
    );
  });
});
