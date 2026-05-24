import { describe, expect, it } from "vitest";

import type { VoteDetails } from "../xml";
import {
  readIngestedVoteDetailsFromD1,
  readKnownVoteNumbersFromD1,
  writeIngestedVoteDetailsToD1,
} from "./ingested-votes";
import { createIngestedVoteDetailsDb } from "./test-helpers";

const sampleDetail: VoteDetails = {
  congress: 119,
  session: 2,
  vote_number: 14,
  vote_date: "2026-01-17",
  vote_title: "Border Infrastructure Modernization Act",
  vote_question: "On Passage of the Bill",
  vote_result: "Agreed to",
  vote_document: "S. 303",
  counts: { yeas: 60, nays: 40, present: 0, not_voting: 0 },
  member_votes: [],
};

describe("ingested vote details", () => {
  it("round-trips vote details through write and read", async () => {
    const db = createIngestedVoteDetailsDb();
    await writeIngestedVoteDetailsToD1(db, [sampleDetail]);

    const known = await readKnownVoteNumbersFromD1(db, 119, 2);
    expect(known).toEqual(new Set([14]));

    const details = await readIngestedVoteDetailsFromD1(db, 119, 2);
    expect(details.get(14)).toEqual(sampleDetail);
  });

  it("filters read requests to requested vote numbers", async () => {
    const db = createIngestedVoteDetailsDb();
    await writeIngestedVoteDetailsToD1(db, [
      sampleDetail,
      { ...sampleDetail, vote_number: 12, vote_date: "2026-01-15" },
    ]);

    const details = await readIngestedVoteDetailsFromD1(db, 119, 2, [12]);
    expect(details.size).toBe(1);
    expect(details.has(12)).toBe(true);
    expect(details.has(14)).toBe(false);
  });
});
