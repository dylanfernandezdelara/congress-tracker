import { describe, expect, it } from "vitest";
import {
  activityVerb,
  formatClearedLabel,
  formatProcessStageLabel,
  formatWaitingLabel,
  isAdvancementActivity,
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

  it("marks advancement activities", () => {
    expect(isAdvancementActivity("worked_on")).toBe(true);
    expect(isAdvancementActivity("advanced")).toBe(true);
    expect(isAdvancementActivity("released")).toBe(true);
    expect(isAdvancementActivity("sent")).toBe(false);
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
  });
});
