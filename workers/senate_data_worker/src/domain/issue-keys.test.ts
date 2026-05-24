import { describe, expect, it } from "vitest";
import type { BillRef, VoteLedgerEntry } from "../types";
import { buildIssueKey, buildThreadKey, extractNominationOffice } from "./issue-keys";

function entry(overrides: Partial<VoteLedgerEntry>): VoteLedgerEntry {
  return {
    vote_number: 1,
    vote_date: "2026-01-20",
    title: "Test vote",
    question: "On Passage",
    result: "Agreed to",
    member_votes: {},
    ...overrides,
  };
}

const bill = (overrides: Partial<BillRef> = {}): BillRef => ({
  congress: 119,
  type: "S.",
  number: "123",
  title: "Sample bill",
  ...overrides,
});

describe("buildThreadKey", () => {
  it("uses bill references when available", () => {
    expect(buildThreadKey(entry({ vote_number: 42 }), bill({ type: "H.J.Res.", number: "140" }))).toBe(
      "119:H.J.Res.:140"
    );
  });

  it("falls back to issue and vote number", () => {
    expect(buildThreadKey(entry({ issue: "PN42", vote_number: 26 }), undefined)).toBe("PN42");
    expect(buildThreadKey(entry({ vote_number: 26 }), undefined)).toBe("vote:26");
  });
});

describe("buildIssueKey", () => {
  it("builds nomination issue keys from confirmation titles", () => {
    const nomination = entry({
      vote_number: 26,
      title:
        "Confirmation: Aaron Christian Peterson, of Alaska, to be United States District Judge for the District of Alaska",
      issue: "PN42",
    });
    expect(extractNominationOffice(nomination.title)).toContain("United States District Judge");
    expect(buildIssueKey(nomination, undefined)).toMatch(/^nomination:/);
  });

  it("builds cloture and procedural keys from descriptive text", () => {
    const cloture = entry({
      vote_number: 501,
      title: "Motion to Invoke Cloture on Aaron Christian Peterson, of Alaska, to be United States District Judge",
      question: "On Cloture",
      issue: "PN999",
    });
    expect(buildIssueKey(cloture, undefined)).toMatch(/^nomination:/);
  });

  it("builds topic keys for war powers votes", () => {
    const warPowers = entry({
      title: "Joint Resolution to direct the removal of United States Armed Forces from hostilities within or against Iran",
      question: "On Passage of the Joint Resolution",
      issue: "S.J.Res. 90",
    });
    expect(buildIssueKey(warPowers, undefined)).toBe("topic:war-powers");
  });

  it("uses bill thread keys when no stronger issue key is available", () => {
    const measure = entry({
      title: "On Passage",
      question: "On Passage",
      issue: "S. 123",
    });
    expect(buildIssueKey(measure, bill({ type: "S.", number: "123", title: "Budget bill" }))).toBe("119:S.:123");
  });
});
