import { describe, it, expect } from "vitest";
import { buildVoteMenuUrl, buildVoteDetailUrl } from "./fetch";

describe("URL Builders", () => {
  describe("buildVoteMenuUrl", () => {
    const testCases = [
      {
        congress: 119,
        session: 1,
        expected:
          "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_1.xml",
        description: "119th Congress, session 1",
      },
      {
        congress: 118,
        session: 2,
        expected:
          "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_118_2.xml",
        description: "118th Congress, session 2",
      },
      {
        congress: 100,
        session: 1,
        expected:
          "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_100_1.xml",
        description: "100th Congress (historical)",
      },
    ];

    it.each(testCases)(
      "$description",
      ({ congress, session, expected }) => {
        const result = buildVoteMenuUrl(congress, session);
        expect(result).toBe(expected);
      }
    );
  });

  describe("buildVoteDetailUrl", () => {
    const testCases = [
      {
        congress: 119,
        session: 1,
        voteNumber: 1,
        expected:
          "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00001.xml",
        description: "Vote 1 (padded to 5 digits)",
      },
      {
        congress: 119,
        session: 1,
        voteNumber: 123,
        expected:
          "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00123.xml",
        description: "Vote 123 (padded)",
      },
      {
        congress: 119,
        session: 1,
        voteNumber: 12345,
        expected:
          "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_12345.xml",
        description: "Vote 12345 (no padding needed)",
      },
      {
        congress: 118,
        session: 2,
        voteNumber: 42,
        expected:
          "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1182/vote_118_2_00042.xml",
        description: "Different congress/session",
      },
    ];

    it.each(testCases)(
      "$description",
      ({ congress, session, voteNumber, expected }) => {
        const result = buildVoteDetailUrl(congress, session, voteNumber);
        expect(result).toBe(expected);
      }
    );
  });
});

