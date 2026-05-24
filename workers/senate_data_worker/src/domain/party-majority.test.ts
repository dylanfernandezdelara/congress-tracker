import { describe, expect, it } from "vitest";
import type { VoteLedgerEntry } from "../types";
import { computePartyMajority, computePartyMajorityLabels, normalizePartyCode } from "./party-majority";

function entry(memberVotes: Record<string, string>): VoteLedgerEntry {
  return {
    vote_number: 1,
    vote_date: "2026-01-20",
    title: "Test vote",
    question: "On Passage",
    result: "Agreed to",
    member_votes: memberVotes,
  };
}

describe("normalizePartyCode", () => {
  it("normalizes common party labels", () => {
    expect(normalizePartyCode("Democrat")).toBe("D");
    expect(normalizePartyCode("Republican")).toBe("R");
    expect(normalizePartyCode("IND")).toBe("I");
  });
});

describe("computePartyMajority", () => {
  const partyById = new Map([
    ["D1", "D"],
    ["D2", "D"],
    ["R1", "R"],
    ["R2", "R"],
  ]);

  it("picks the yea side on a party tie", () => {
    const majority = computePartyMajority(entry({ D1: "Yea", D2: "Nay", R1: "Yea", R2: "Yea" }), partyById);
    expect(majority.get("D")).toBe("yea");
    expect(majority.get("R")).toBe("yea");
  });

  it("ignores present and not-voting members", () => {
    const majority = computePartyMajority(
      entry({ D1: "Yea", D2: "Present", R1: "Nay", R2: "Not Voting" }),
      partyById
    );
    expect(majority.get("D")).toBe("yea");
    expect(majority.get("R")).toBe("nay");
  });

  it("returns ingest-style labels", () => {
    const labels = computePartyMajorityLabels(entry({ D1: "Yea", D2: "Nay", R1: "Nay", R2: "Nay" }), partyById);
    expect(labels.get("D")).toBe("Yea");
    expect(labels.get("R")).toBe("Nay");
  });
});
