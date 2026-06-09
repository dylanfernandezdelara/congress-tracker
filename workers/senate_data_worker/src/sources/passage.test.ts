import { describe, expect, it } from "vitest";
import { isPassageVote } from "./passage";

describe("isPassageVote", () => {
  it("accepts dominant passage questions", () => {
    expect(isPassageVote("On Passage of the Bill")).toBe(true);
    expect(isPassageVote("On Passage")).toBe(true);
    expect(isPassageVote("On Motion to Suspend the Rules and Pass")).toBe(true);
    expect(isPassageVote("On Agreeing to the Resolution")).toBe(true);
  });

  it("rejects procedural votes", () => {
    expect(isPassageVote("On the Cloture Motion")).toBe(false);
    expect(isPassageVote("On the Motion to Proceed")).toBe(false);
  });
});
