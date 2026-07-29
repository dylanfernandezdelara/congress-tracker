import { describe, expect, it } from "vitest";
import { isConfirmationVote, isConfirmedResult } from "./confirmation";

describe("isConfirmationVote", () => {
  it("accepts nomination confirmation questions", () => {
    expect(isConfirmationVote("On the Nomination")).toBe(true);
    expect(isConfirmationVote("On the Nomination (Confirmation)")).toBe(true);
    expect(isConfirmationVote("  on the nomination  ")).toBe(true);
  });

  it("rejects cloture, passage, and other procedural votes", () => {
    expect(isConfirmationVote("On the Cloture Motion")).toBe(false);
    expect(isConfirmationVote("On Passage of the Bill")).toBe(false);
    expect(isConfirmationVote("On the Motion to Proceed")).toBe(false);
    expect(isConfirmationVote("Nomination")).toBe(false);
  });
});

describe("isConfirmedResult", () => {
  it("accepts Confirmed and Agreed to", () => {
    expect(isConfirmedResult("Confirmed")).toBe(true);
    expect(isConfirmedResult("Agreed to")).toBe(true);
  });

  it("rejects failures", () => {
    expect(isConfirmedResult("Not Confirmed")).toBe(false);
    expect(isConfirmedResult("Rejected")).toBe(false);
    expect(isConfirmedResult("Failed")).toBe(false);
  });
});
