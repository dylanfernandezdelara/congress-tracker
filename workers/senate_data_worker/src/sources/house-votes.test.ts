import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { voteKey } from "../vote-key";
import { ingestHousePassageVotes } from "./house-votes";
import * as http from "./http";

const env = {
  CONGRESS: "119",
  SESSION: "2",
  CONGRESS_API_KEY: "test-key",
} as Env;

describe("ingestHousePassageVotes", () => {
  it("skips detail fetches for votes already in D1", async () => {
    const fetchJson = vi.spyOn(http, "fetchJson").mockImplementation(async (url: string) => {
      if (url.includes("/100?")) {
        return {
          houseRollCallVote: {
            congress: 119,
            rollCallNumber: 100,
            sessionNumber: 2,
            legislationNumber: "5678",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-02T12:00:00Z",
            voteQuestion: "On Passage",
            votePartyTotal: [{ yeaTotal: 220, nayTotal: 210 }],
          },
        };
      }

      return {
        houseRollCallVotes: [
          {
            congress: 119,
            rollCallNumber: 99,
            sessionNumber: 2,
            legislationNumber: "1234",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-01T12:00:00Z",
          },
          {
            congress: 119,
            rollCallNumber: 100,
            sessionNumber: 2,
            legislationNumber: "5678",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-02T12:00:00Z",
          },
        ],
        pagination: {},
      };
    });

    const knownKeys = new Set([
      voteKey({ chamber: "House", congress: 119, session: 2, rollNumber: 99 }),
    ]);

    const result = await ingestHousePassageVotes(env, "2026-05-01", knownKeys);

    expect(result.skipped).toBe(1);
    expect(result.votes).toHaveLength(1);
    expect(result.votes[0]?.rollNumber).toBe(100);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson.mock.calls[1]?.[0]).toContain("/100?");

    fetchJson.mockRestore();
  });

  it("pages past pre-lookback House votes because Congress.gov returns oldest-first", async () => {
    const fetchJson = vi.spyOn(http, "fetchJson").mockImplementation(async (url: string) => {
      if (url.includes("/200?")) {
        return {
          houseRollCallVote: {
            congress: 119,
            rollCallNumber: 200,
            sessionNumber: 2,
            legislationNumber: "9001",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-10T12:00:00Z",
            voteQuestion: "On Passage",
            votePartyTotal: [{ yeaTotal: 220, nayTotal: 210 }],
          },
        };
      }

      if (url.includes("offset=2")) {
        return {
          houseRollCallVotes: [
            {
              congress: 119,
              rollCallNumber: 200,
              sessionNumber: 2,
              legislationNumber: "9001",
              legislationType: "HR",
              result: "Passed",
              startDate: "2026-06-10T12:00:00Z",
            },
          ],
          pagination: {},
        };
      }

      return {
        houseRollCallVotes: [
          {
            congress: 119,
            rollCallNumber: 1,
            sessionNumber: 2,
            legislationNumber: "1000",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-02-01T12:00:00Z",
          },
          {
            congress: 119,
            rollCallNumber: 2,
            sessionNumber: 2,
            legislationNumber: "1001",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-02-02T12:00:00Z",
          },
        ],
        pagination: {
          next: "https://api.congress.gov/v3/house-vote/119/2?offset=2&limit=50&format=json",
        },
      };
    });

    const result = await ingestHousePassageVotes(env, "2026-05-01", new Set());

    expect(result.votes).toHaveLength(1);
    expect(result.votes[0]?.rollNumber).toBe(200);
    expect(fetchJson).toHaveBeenCalledTimes(3);

    fetchJson.mockRestore();
  });
});
