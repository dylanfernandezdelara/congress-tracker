import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson } = vi.hoisted(() => ({
  fetchJson: vi.fn(),
}));

vi.mock("./http", () => ({ fetchJson }));

import { fetchHouseMemberVotes } from "./house-member-votes";

const env = { CONGRESS_API_KEY: "test-key" } as any;

describe("fetchHouseMemberVotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses the current Congress.gov houseRollCallVoteMemberVotes envelope", async () => {
    fetchJson.mockResolvedValueOnce({
      houseRollCallVoteMemberVotes: {
        results: [
          {
            bioguideID: "A000055",
            firstName: "Robert",
            lastName: "Aderholt",
            voteCast: "Yea",
            voteParty: "R",
            voteState: "AL",
          },
          {
            bioguideID: "A000148",
            firstName: "Jake",
            lastName: "Auchincloss",
            voteCast: "Nay",
            voteParty: "D",
            voteState: "MA",
          },
        ],
      },
    });

    const { members, votes } = await fetchHouseMemberVotes(env, 119, 2, 247);

    expect(fetchJson).toHaveBeenCalledWith(
      "https://api.congress.gov/v3/house-vote/119/2/247/members?format=json&limit=250&api_key=test-key"
    );
    expect(votes).toEqual([
      {
        chamber: "House",
        congress: 119,
        session: 2,
        rollNumber: 247,
        bioguideId: "A000055",
        position: "Yea",
      },
      {
        chamber: "House",
        congress: 119,
        session: 2,
        rollNumber: 247,
        bioguideId: "A000148",
        position: "Nay",
      },
    ]);
    expect(members).toEqual([
      {
        bioguideId: "A000055",
        name: "Robert Aderholt",
        chamber: "House",
        party: "R",
        state: "AL",
        district: null,
      },
      {
        bioguideId: "A000148",
        name: "Jake Auchincloss",
        chamber: "House",
        party: "D",
        state: "MA",
        district: null,
      },
    ]);
  });

  it("paginates when Congress.gov returns a next URL", async () => {
    fetchJson
      .mockResolvedValueOnce({
        houseRollCallVoteMemberVotes: {
          results: [
            {
              bioguideID: "A000001",
              firstName: "A",
              lastName: "One",
              voteCast: "Yea",
              voteParty: "R",
              voteState: "TX",
            },
          ],
        },
        pagination: {
          next: "https://api.congress.gov/v3/house-vote/119/2/247/members?offset=250&limit=250&format=json",
        },
      })
      .mockResolvedValueOnce({
        houseRollCallVoteMemberVotes: {
          results: [
            {
              bioguideID: "B000001",
              firstName: "B",
              lastName: "Two",
              voteCast: "Nay",
              voteParty: "D",
              voteState: "CA",
            },
          ],
        },
      });

    const { votes } = await fetchHouseMemberVotes(env, 119, 2, 247);

    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson).toHaveBeenNthCalledWith(
      2,
      "https://api.congress.gov/v3/house-vote/119/2/247/members?offset=250&limit=250&format=json&api_key=test-key"
    );
    expect(votes.map((v) => v.bioguideId)).toEqual(["A000001", "B000001"]);
  });

  it("accepts the legacy flat houseRollCallVoteMembers shape", async () => {
    fetchJson.mockResolvedValueOnce({
      houseRollCallVoteMembers: [
        {
          bioguideId: "C000001",
          firstName: "Legacy",
          lastName: "Member",
          votePosition: "Yea",
          voteParty: "D",
          voteState: "NY",
        },
      ],
    });

    const { votes } = await fetchHouseMemberVotes(env, 119, 2, 1);
    expect(votes).toHaveLength(1);
    expect(votes[0]?.bioguideId).toBe("C000001");
    expect(votes[0]?.position).toBe("Yea");
  });

  it("requires CONGRESS_API_KEY", async () => {
    await expect(fetchHouseMemberVotes({} as any, 119, 2, 1)).rejects.toThrow(
      /CONGRESS_API_KEY/
    );
  });
});
