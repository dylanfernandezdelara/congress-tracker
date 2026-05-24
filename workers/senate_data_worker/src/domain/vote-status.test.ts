import { describe, expect, it } from "vitest";
import { isPassed, normalizeVoteStatus, toStatus } from "./vote-status";

describe("vote status normalization", () => {
  it("marks passed results", () => {
    for (const result of ["Agreed to", "Passed", "Confirmed", "Invoked", "Adopted", "Approved"]) {
      expect(isPassed(result)).toBe(true);
      expect(toStatus(result)).toBe("passed");
      expect(normalizeVoteStatus(result)).toBe("passed");
    }
  });

  it("marks rejected results", () => {
    for (const result of [
      "Failed",
      "Rejected",
      "Not Agreed to",
      "Not Passed",
      "Disagreed to",
      "Not Invoked",
      "Not Confirmed",
    ]) {
      expect(isPassed(result)).toBe(false);
      expect(toStatus(result)).toBe("rejected");
      expect(normalizeVoteStatus(result)).toBe("rejected");
    }
  });

  it("defaults unknown results to rejected", () => {
    expect(normalizeVoteStatus("Unknown")).toBe("rejected");
    expect(toStatus("Unknown")).toBe("rejected");
  });
});
