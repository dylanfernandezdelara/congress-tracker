import { beforeEach, describe, expect, it, vi } from "vitest";

const { runFeedPipeline, runMemberVotesPipeline } = vi.hoisted(() => ({
  runFeedPipeline: vi.fn(),
  runMemberVotesPipeline: vi.fn(),
}));

vi.mock("./run-feed", () => ({ runFeedPipeline }));
vi.mock("./run-member-votes", () => ({ runMemberVotesPipeline }));

import { runFeedWithMemberVotes } from "./run-feed-with-member-votes";

const feedResult = {
  votesUpserted: 1,
  votesSkipped: 0,
  billsSelected: 1,
  digestsWritten: 1,
  digestsSkipped: 0,
  digestsRewritten: 1,
  digestWarnings: [],
  chamberWarnings: [],
  lifecycleRefreshed: 0,
  lifecycleSkipped: 0,
  lifecycleWarnings: [],
  textChangesRefreshed: 0,
  textChangesWithAddedProvisions: 0,
  textChangesWarnings: [],
  confirmationVotesUpserted: 0,
  confirmationNominationsFetched: 0,
  confirmationBackgroundsRewritten: 0,
  confirmationWikipediaLookups: 0,
  confirmationVoteContextsWritten: 0,
  confirmationWarnings: [],
};

describe("runFeedWithMemberVotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runFeedPipeline.mockResolvedValue(feedResult);
    runMemberVotesPipeline.mockResolvedValue({
      rollsProcessed: 2,
      rollsSkipped: 0,
      rollsAttempted: 2,
      rollsRemaining: 0,
      membersUpserted: 10,
      votesUpserted: 800,
    });
  });

  it("runs feed then member-votes and returns both", async () => {
    const env = { CONGRESS: "119" } as any;
    const result = await runFeedWithMemberVotes(env, { trigger: "scheduled" });

    expect(runFeedPipeline).toHaveBeenCalledWith(env, { trigger: "scheduled" });
    expect(runMemberVotesPipeline).toHaveBeenCalledWith(env);
    expect(result.votesUpserted).toBe(1);
    expect(result.memberVotes?.rollsProcessed).toBe(2);
    expect(result.memberVotesError).toBeUndefined();
  });

  it("keeps feed success when member-votes fails", async () => {
    runMemberVotesPipeline.mockRejectedValue(new Error("member votes down"));

    const result = await runFeedWithMemberVotes({} as any, { trigger: "admin" });

    expect(result.votesUpserted).toBe(1);
    expect(result.memberVotes).toBeUndefined();
    expect(result.memberVotesError).toContain("member votes down");
  });
});
