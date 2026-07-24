import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { resetSchemaFlag } from "../d1/schema";
import { voteKey } from "../vote-key";
import {
  ingestSenatePassageVotes,
  parseSenateVoteDate,
  parseSenateVoteMenuXml,
} from "./senate-votes";
import * as senateFetch from "./senate-fetch";

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, "../fixtures/senate-vote-menu.sample.xml"), "utf8");

describe("parseSenateVoteDate", () => {
  it("keeps in-year dates when congress_year matches", () => {
    expect(parseSenateVoteDate("05-Jun", "2026", new Date("2026-06-10T00:00:00Z"))).toBe(
      "2026-06-05"
    );
  });

  it("rolls December votes back one year when congress_year is already the new year", () => {
    // Menu stamped congress_year=2027 in early January; vote is still 20-Dec.
    expect(parseSenateVoteDate("20-Dec", "2027", new Date("2027-01-05T12:00:00Z"))).toBe(
      "2026-12-20"
    );
  });

  it("rolls November votes back under the same year-boundary heuristic", () => {
    expect(parseSenateVoteDate("18-Nov", "2027", new Date("2027-01-05T12:00:00Z"))).toBe(
      "2026-11-18"
    );
  });

  it("does not roll back near-future dates within the slack window", () => {
    // A vote a few days ahead of "now" can be clock/source skew, not a year error.
    expect(parseSenateVoteDate("28-Jul", "2026", new Date("2026-07-24T00:00:00Z"))).toBe(
      "2026-07-28"
    );
  });

  it("rolls back dates more than a few days in the future", () => {
    expect(parseSenateVoteDate("15-Dec", "2027", new Date("2027-01-02T00:00:00Z"))).toBe(
      "2026-12-15"
    );
  });

  it("does not year-roll mid-year dates even when far ahead of now", () => {
    // Menu data errors should not invent a prior-year August stamp.
    expect(parseSenateVoteDate("15-Aug", "2027", new Date("2027-01-02T00:00:00Z"))).toBe(
      "2027-08-15"
    );
  });
});

describe("parseSenateVoteMenuXml", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("keeps passage votes linked to bills", () => {
    const votes = parseSenateVoteMenuXml(sample, 119, 2, new Date("2026-06-30T00:00:00Z"));
    expect(votes).toHaveLength(2);
    expect(votes[0]).toMatchObject({
      chamber: "Senate",
      rollNumber: 163,
      bill: { congress: 119, type: "S", number: 2 },
      result: "Passed",
      yeas: 52,
      nays: 47,
      voteDate: "2026-06-05",
    });
    expect(votes[1]).toMatchObject({
      chamber: "Senate",
      rollNumber: 182,
      bill: { congress: 119, type: "HR", number: 6644 },
      question: "Motion to Concur in the House Amendment to the Senate Amendment to H.R. 6644 with an Amendment (SA 5823)",
      result: "Agreed to",
      yeas: 85,
      nays: 5,
      voteDate: "2026-06-22",
    });
  });

  it("skips votes already stored in D1", async () => {
    const fetchSenate = vi
      .spyOn(senateFetch, "fetchSenateLegislativeText")
      .mockResolvedValue(sample);
    const env = {
      CONGRESS: "119",
      SESSION: "2",
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
            run: async () => ({ success: true, meta: { duration: 0 } }),
          }),
          run: async () => ({ success: true, meta: { duration: 0 } }),
        }),
      },
    } as unknown as Env;
    const knownKeys = new Set([
      voteKey({ chamber: "Senate", congress: 119, session: 2, rollNumber: 163 }),
    ]);

    const result = await ingestSenatePassageVotes(env, "2026-01-01", knownKeys);

    expect(result.skipped).toBe(1);
    expect(result.votes).toHaveLength(1);
    expect(result.votes[0]?.rollNumber).toBe(182);

    fetchSenate.mockRestore();
  });
});
