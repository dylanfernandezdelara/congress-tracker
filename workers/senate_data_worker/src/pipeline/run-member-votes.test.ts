import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRecord, MemberVoteRecord } from "../types";
import type { RollCallKey } from "../d1/member-votes";

const {
  selectPassageRollCalls,
  countMemberVotesForRoll,
  countLisMemberVotesForRoll,
  deleteMemberVotesForRoll,
  upsertMemberVotesBatch,
  upsertMembersBatch,
  fetchHouseMemberVotes,
  fetchSenateMemberVotes,
} = vi.hoisted(() => ({
  selectPassageRollCalls: vi.fn(),
  countMemberVotesForRoll: vi.fn(),
  countLisMemberVotesForRoll: vi.fn(async () => 0),
  deleteMemberVotesForRoll: vi.fn(async () => {}),
  upsertMemberVotesBatch: vi.fn(async () => {}),
  upsertMembersBatch: vi.fn(async () => {}),
  fetchHouseMemberVotes: vi.fn(),
  fetchSenateMemberVotes: vi.fn(),
}));

vi.mock("../d1/schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("../d1/member-votes", () => ({
  selectPassageRollCalls,
  countMemberVotesForRoll,
  countLisMemberVotesForRoll,
  deleteMemberVotesForRoll,
  upsertMemberVotesBatch,
}));
vi.mock("../d1/members", () => ({
  upsertMembersBatch,
  hasRealMemberRoster: vi.fn(async () => true),
  buildSenateBioguideLookup: vi.fn(async () => new Map()),
}));
vi.mock("./run-members-roster", () => ({
  runMembersRosterPipeline: vi.fn(async () => ({
    congress: 119,
    membersUpserted: 535,
    house: 435,
    senate: 100,
  })),
}));
vi.mock("../sources/house-member-votes", () => ({ fetchHouseMemberVotes }));
vi.mock("../sources/senate-member-votes", () => ({ fetchSenateMemberVotes }));

import { runMemberVotesPipeline } from "./run-member-votes";
import { MEMBER_VOTES_MAX_ROLLS_PER_RUN } from "../constants";

const env = { DB: {}, CONGRESS: "119", SESSION: "2" } as any;

function houseRoll(rollNumber: number): RollCallKey {
  return { chamber: "House", congress: 119, session: 2, roll_number: rollNumber };
}

function fakeFetch(memberIds: string[]) {
  const members: MemberRecord[] = memberIds.map((id) => ({
    bioguideId: id,
    name: `Member ${id}`,
    chamber: "House",
    party: "D",
    state: "CA",
    district: 1,
  }));
  return (
    _env: unknown,
    congress: number,
    session: number,
    rollNumber: number
  ): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> => {
    const votes: MemberVoteRecord[] = memberIds.map((id) => ({
      chamber: "House",
      congress,
      session,
      rollNumber,
      bioguideId: id,
      position: "Yea",
    }));
    return Promise.resolve({ members, votes });
  };
}

describe("runMemberVotesPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMemberVotesForRoll.mockResolvedValue(0);
    fetchHouseMemberVotes.mockImplementation(fakeFetch(["A", "B"]));
    fetchSenateMemberVotes.mockImplementation(fakeFetch([]));
  });

  it("batches writes and dedupes members across rolls", async () => {
    selectPassageRollCalls.mockResolvedValue([houseRoll(1), houseRoll(2)]);

    const result = await runMemberVotesPipeline(env);

    expect(result.rollsProcessed).toBe(2);
    expect(result.rollsRemaining).toBe(0);
    expect(result.votesUpserted).toBe(4);
    // Members A and B appear on both rolls but are upserted once.
    expect(result.membersUpserted).toBe(2);
    expect(upsertMemberVotesBatch).toHaveBeenCalledTimes(2);
  });

  it("skips rolls that already have member votes (idempotent re-run)", async () => {
    selectPassageRollCalls.mockResolvedValue([houseRoll(1), houseRoll(2)]);
    countMemberVotesForRoll.mockResolvedValueOnce(0).mockResolvedValueOnce(435);

    const result = await runMemberVotesPipeline(env);

    expect(result.rollsProcessed).toBe(1);
    expect(result.rollsSkipped).toBe(1);
    expect(upsertMemberVotesBatch).toHaveBeenCalledTimes(1);
  });

  it("re-ingests Senate rolls that still have unresolved LIS member ids", async () => {
    selectPassageRollCalls.mockResolvedValue([{ chamber: "Senate", congress: 119, session: 2, roll_number: 1 }]);
    countMemberVotesForRoll.mockResolvedValue(100);
    countLisMemberVotesForRoll.mockResolvedValue(5);
    fetchSenateMemberVotes.mockImplementation(fakeFetch(["S000001"]));

    const result = await runMemberVotesPipeline(env);

    expect(fetchSenateMemberVotes).toHaveBeenCalledTimes(1);
    expect(deleteMemberVotesForRoll).toHaveBeenCalledTimes(1);
    expect(fetchSenateMemberVotes.mock.invocationCallOrder[0]).toBeLessThan(
      deleteMemberVotesForRoll.mock.invocationCallOrder[0]!
    );
    expect(result.rollsProcessed).toBe(1);
  });

  it("does not delete LIS rows when the re-fetch fails", async () => {
    selectPassageRollCalls.mockResolvedValue([{ chamber: "Senate", congress: 119, session: 2, roll_number: 1 }]);
    countMemberVotesForRoll.mockResolvedValue(100);
    countLisMemberVotesForRoll.mockResolvedValue(5);
    fetchSenateMemberVotes.mockRejectedValueOnce(new Error("HTTP 403"));

    const result = await runMemberVotesPipeline(env);

    expect(deleteMemberVotesForRoll).not.toHaveBeenCalled();
    expect(result.rollsProcessed).toBe(0);
    expect(result.rollsAttempted).toBe(1);
    expect(result.rollsSkipped).toBe(1);
  });

  it("caps upstream fetch attempts per invocation and reports the remainder", async () => {
    const rolls = Array.from({ length: MEMBER_VOTES_MAX_ROLLS_PER_RUN + 5 }, (_, i) =>
      houseRoll(i + 1)
    );
    selectPassageRollCalls.mockResolvedValue(rolls);

    const result = await runMemberVotesPipeline(env);

    expect(result.rollsAttempted).toBe(MEMBER_VOTES_MAX_ROLLS_PER_RUN);
    expect(result.rollsProcessed).toBe(MEMBER_VOTES_MAX_ROLLS_PER_RUN);
    expect(result.rollsRemaining).toBe(5);
  });

  it("continues when a single roll fetch fails and charges the attempt budget", async () => {
    selectPassageRollCalls.mockResolvedValue([
      houseRoll(1),
      { chamber: "Senate", congress: 119, session: 2, roll_number: 1 },
      houseRoll(2),
    ]);
    fetchSenateMemberVotes.mockRejectedValueOnce(new Error("HTTP 403 for https://www.senate.gov/..."));

    const result = await runMemberVotesPipeline(env);

    expect(result.rollsProcessed).toBe(2);
    expect(result.rollsSkipped).toBe(1);
    expect(result.rollsAttempted).toBe(3);
    expect(upsertMemberVotesBatch).toHaveBeenCalledTimes(2);
  });
});
