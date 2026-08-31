import { describe, expect, it } from "vitest";
import {
  activityVerb,
  formatClearedLabel,
  formatFloorActionLabel,
  formatProcessChipLabel,
  formatProcessStageLabel,
  formatWaitingLabel,
  normalizeCommitteeActivity,
  shortCommitteeName,
} from "./bill-process-labels";

describe("bill-process-labels", () => {
  it("normalizes Congress.gov activity names", () => {
    expect(normalizeCommitteeActivity("Referred To")).toBe("sent");
    expect(normalizeCommitteeActivity("Markup by")).toBe("worked_on");
    expect(normalizeCommitteeActivity("Reported By")).toBe("advanced");
    expect(normalizeCommitteeActivity("Discharged From")).toBe("released");
    expect(normalizeCommitteeActivity("Hearings by")).toBe("hearings");
    expect(normalizeCommitteeActivity("Bills of Interest - Exchange of Letters")).toBe(
      "interest"
    );
    expect(normalizeCommitteeActivity("Unknown")).toBe("other");
  });

  it("formats plain-English stage and waiting labels", () => {
    expect(activityVerb("sent")).toBe("Sent to");
    expect(
      formatProcessStageLabel({
        activityKey: "advanced",
        committeeName: "Health Subcommittee",
        parentCommitteeName: "Energy and Commerce Committee",
        tallyText: "47-0",
      })
    ).toBe(
      "Committee advanced the bill from Energy and Commerce Committee → Health Subcommittee (47-0)"
    );
    expect(formatWaitingLabel("Senate HELP Committee")).toBe(
      "In Senate HELP Committee · waiting for the committee to act"
    );
    expect(formatClearedLabel("Financial Services")).toBe(
      "Cleared Financial Services · waiting for a chamber vote"
    );
    expect(shortCommitteeName("Energy and Commerce Committee")).toBe(
      "Energy and Commerce"
    );
    expect(formatProcessChipLabel("in_committee", "House Administration Committee")).toBe(
      "In House Administration"
    );
    expect(formatProcessChipLabel("cleared_committee", "Financial Services Committee")).toBe(
      "Cleared Financial Services"
    );
    expect(formatProcessChipLabel("introduced", "Energy and Commerce Committee")).toBe(null);
  });

  it("formats floor-action labels with chamber and tally", () => {
    expect(formatFloorActionLabel({ key: "received", chamber: "Senate" })).toBe(
      "Received in the Senate"
    );
    expect(formatFloorActionLabel({ key: "calendar", chamber: "House" })).toBe(
      "Placed on the House calendar"
    );
    expect(formatFloorActionLabel({ key: "cloture", chamber: "Senate", tallyText: "60-37" })).toBe(
      "Cloture in the Senate (60-37)"
    );
    expect(formatFloorActionLabel({ key: "conference", chamber: null })).toBe("Conference committee");
    expect(formatFloorActionLabel({ key: "considered", chamber: "House" })).toBe(
      "Debated in the House"
    );
  });
});
