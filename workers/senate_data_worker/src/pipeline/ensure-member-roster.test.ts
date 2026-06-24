import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";

const mockHasRealMemberRoster = vi.fn<() => Promise<boolean>>();
const mockRunMembersRosterPipeline = vi.fn<() => Promise<object>>();

vi.mock("../d1/members", () => ({
  hasRealMemberRoster: () => mockHasRealMemberRoster(),
}));

vi.mock("./run-members-roster", () => ({
  runMembersRosterPipeline: () => mockRunMembersRosterPipeline(),
}));

import { ensureMemberRoster } from "./ensure-member-roster";

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test-key",
    OPENROUTER_API_KEY: "test-key",
    ...overrides,
  };
}

describe("ensureMemberRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRealMemberRoster.mockResolvedValue(false);
    mockRunMembersRosterPipeline.mockResolvedValue({
      congress: 119,
      membersUpserted: 537,
      house: 437,
      senate: 100,
    });
  });

  it("syncs when the roster is missing and an API key is configured", async () => {
    const synced = await ensureMemberRoster(createEnv());

    expect(synced).toBe(true);
    expect(mockRunMembersRosterPipeline).toHaveBeenCalledOnce();
  });

  it("skips when a real roster is already present", async () => {
    mockHasRealMemberRoster.mockResolvedValue(true);

    const synced = await ensureMemberRoster(createEnv());

    expect(synced).toBe(false);
    expect(mockRunMembersRosterPipeline).not.toHaveBeenCalled();
  });

  it("skips when Congress.gov credentials are unavailable", async () => {
    const synced = await ensureMemberRoster(createEnv({ CONGRESS_API_KEY: "" }));

    expect(synced).toBe(false);
    expect(mockRunMembersRosterPipeline).not.toHaveBeenCalled();
  });
});
