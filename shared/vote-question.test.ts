import { describe, expect, it } from "vitest";
import { cleanVoteQuestion } from "./vote-question";

describe("cleanVoteQuestion", () => {
  it("unwraps Senate LIS <measure> tags and keeps the amendment id", () => {
    expect(cleanVoteQuestion("On the Motion to Table <measure>S.Amdt. 6747</measure>")).toBe(
      "On the Motion to Table S.Amdt. 6747",
    );
    expect(cleanVoteQuestion("On the Cloture Motion <measure>S.Amdt. 6732</measure>")).toBe(
      "On the Cloture Motion S.Amdt. 6732",
    );
    expect(cleanVoteQuestion("On the Amendment <measure>S.Amdt. 6715</measure>")).toBe(
      "On the Amendment S.Amdt. 6715",
    );
  });

  it("strips escaped measure tags after entity decode", () => {
    expect(
      cleanVoteQuestion("On the Amendment &lt;measure&gt;S.Amdt. 1&lt;/measure&gt;"),
    ).toBe("On the Amendment S.Amdt. 1");
  });

  it("is a no-op on already-plain questions", () => {
    expect(cleanVoteQuestion("On Passage of the Bill")).toBe("On Passage of the Bill");
    expect(cleanVoteQuestion("  On Motion to Recommit  ")).toBe("On Motion to Recommit");
    expect(cleanVoteQuestion("")).toBe("");
    expect(cleanVoteQuestion(null)).toBe("");
  });
});
