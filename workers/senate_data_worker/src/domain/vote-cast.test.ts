import { describe, expect, it } from "vitest";
import { classifyVote, isYeaOrNayCast } from "./vote-cast";

describe("classifyVote", () => {
  it("classifies yea variants", () => {
    expect(classifyVote("Yea")).toBe("yea");
    expect(classifyVote("Aye")).toBe("yea");
    expect(classifyVote("yes")).toBe("yea");
  });

  it("classifies nay variants", () => {
    expect(classifyVote("Nay")).toBe("nay");
    expect(classifyVote("no")).toBe("nay");
  });

  it("classifies present and absent votes", () => {
    expect(classifyVote("Present")).toBe("present");
    expect(classifyVote("Not Voting")).toBe("notVoting");
    expect(classifyVote(undefined)).toBe("notVoting");
  });

  it("detects yea/nay casts for party majority", () => {
    expect(isYeaOrNayCast("Yea")).toBe(true);
    expect(isYeaOrNayCast("Present")).toBe(false);
  });
});
