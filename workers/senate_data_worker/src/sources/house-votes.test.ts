import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { HOUSE_VOTE_DETAIL_FETCHES_PER_RUN } from "../constants";
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

  it("does not stub when vote detail is missing so the roll can be retried", async () => {
    const fetchJson = vi.spyOn(http, "fetchJson").mockImplementation(async (url: string) => {
      if (url.includes("/50?")) {
        return { houseRollCallVote: undefined };
      }

      return {
        houseRollCallVotes: [
          {
            congress: 119,
            rollCallNumber: 50,
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-05T12:00:00Z",
          },
        ],
        pagination: {},
      };
    });

    const result = await ingestHousePassageVotes(env, "2026-05-01", new Set());
    expect(result.votes).toHaveLength(0);
    expect(result.nonPassageStubs).toBeUndefined();

    fetchJson.mockRestore();
  });

  it("does not stub when vote detail has empty question and title", async () => {
    const fetchJson = vi.spyOn(http, "fetchJson").mockImplementation(async (url: string) => {
      if (url.includes("/51?")) {
        return {
          houseRollCallVote: {
            congress: 119,
            rollCallNumber: 51,
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-05T12:00:00Z",
            voteQuestion: "   ",
            voteTitle: "",
            votePartyTotal: [{ yeaTotal: 220, nayTotal: 210 }],
          },
        };
      }

      return {
        houseRollCallVotes: [
          {
            congress: 119,
            rollCallNumber: 51,
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-05T12:00:00Z",
          },
        ],
        pagination: {},
      };
    });

    const result = await ingestHousePassageVotes(env, "2026-05-01", new Set());
    expect(result.votes).toHaveLength(0);
    expect(result.nonPassageStubs).toBeUndefined();

    fetchJson.mockRestore();
  });

  it("does not re-fetch detail for a roll previously seen as non-passage", async () => {
    let detailFetches = 0;
    const fetchJson = vi.spyOn(http, "fetchJson").mockImplementation(async (url: string) => {
      if (url.includes("/50?")) {
        detailFetches += 1;
        return {
          houseRollCallVote: {
            congress: 119,
            rollCallNumber: 50,
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Failed",
            startDate: "2026-06-05T12:00:00Z",
            voteQuestion: "On Ordering the Previous Question",
            voteTitle: "Providing for consideration",
            votePartyTotal: [{ yeaTotal: 210, nayTotal: 200 }],
          },
        };
      }

      return {
        houseRollCallVotes: [
          {
            congress: 119,
            rollCallNumber: 50,
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Failed",
            startDate: "2026-06-05T12:00:00Z",
          },
        ],
        pagination: {},
      };
    });

    const first = await ingestHousePassageVotes(env, "2026-05-01", new Set());
    expect(first.votes).toHaveLength(0);
    expect(first.nonPassageStubs).toHaveLength(1);
    expect(first.nonPassageStubs?.[0]?.rollNumber).toBe(50);
    expect(detailFetches).toBe(1);

    const knownAfterPersist = new Set([
      voteKey({ chamber: "House", congress: 119, session: 2, rollNumber: 50 }),
    ]);
    const second = await ingestHousePassageVotes(env, "2026-05-01", knownAfterPersist);
    expect(second.votes).toHaveLength(0);
    expect(second.skipped).toBe(1);
    expect(second.nonPassageStubs).toBeUndefined();
    expect(detailFetches).toBe(1);

    fetchJson.mockRestore();
  });

  it("falls back to the vote title when a companion roll has no question", async () => {
    // An empty question would make the stub look unfilled forever: it is
    // re-fetched by every run and never shown as a companion vote.
    const fetchJson = vi.spyOn(http, "fetchJson").mockImplementation(async (url: string) => {
      if (url.includes("/51?")) {
        return {
          houseRollCallVote: {
            congress: 119,
            rollCallNumber: 51,
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Failed",
            startDate: "2026-06-05T12:00:00Z",
            voteQuestion: "  ",
            voteTitle: "Motion to Recommit  with Instructions",
            votePartyTotal: [{ yeaTotal: 210, nayTotal: 216 }],
          },
        };
      }
      return {
        houseRollCallVotes: [
          {
            congress: 119,
            rollCallNumber: 51,
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Failed",
            startDate: "2026-06-05T12:00:00Z",
          },
        ],
        pagination: {},
      };
    });

    const result = await ingestHousePassageVotes(env, "2026-05-01", new Set());
    expect(result.nonPassageStubs?.[0]).toMatchObject({
      rollNumber: 51,
      question: "Motion to Recommit with Instructions",
      yeas: 210,
      nays: 216,
    });

    fetchJson.mockRestore();
  });

  it("stops fetching roll detail once the per-run budget is spent", async () => {
    // A backlog of unfetched rolls must not exhaust the Worker subrequest limit.
    let detailFetches = 0;
    const fetchJson = vi.spyOn(http, "fetchJson").mockImplementation(async (url: string) => {
      const detail = url.match(/\/(\d+)\?format=json/);
      if (detail && !url.includes("/119/2?")) {
        detailFetches += 1;
        return {
          houseRollCallVote: {
            congress: 119,
            rollCallNumber: Number(detail[1]),
            sessionNumber: 2,
            legislationNumber: "100",
            legislationType: "HR",
            result: "Passed",
            startDate: "2026-06-05T12:00:00Z",
            voteQuestion: "On Passage",
            votePartyTotal: [{ yeaTotal: 220, nayTotal: 200 }],
          },
        };
      }
      return {
        houseRollCallVotes: Array.from({ length: 300 }, (_, i) => ({
          congress: 119,
          rollCallNumber: i + 1,
          sessionNumber: 2,
          legislationNumber: "100",
          legislationType: "HR",
          result: "Passed",
          startDate: "2026-06-05T12:00:00Z",
        })),
        pagination: {},
      };
    });

    const result = await ingestHousePassageVotes(env, "2026-05-01", new Set());

    expect(detailFetches).toBe(HOUSE_VOTE_DETAIL_FETCHES_PER_RUN);
    expect(result.truncated).toBe(true);
    expect(result.votes).toHaveLength(HOUSE_VOTE_DETAIL_FETCHES_PER_RUN);

    fetchJson.mockRestore();
  });
});
