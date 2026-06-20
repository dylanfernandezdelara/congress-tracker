import { describe, expect, it } from "vitest";
import {
  buildGamePrompt,
  getGameCorrectAnswer,
  voteIndicatesFailure,
} from "../../../shared/feed-content";

describe("feed-content game helpers", () => {
  it("builds a blind prompt from digest content", () => {
    const prompt = buildGamePrompt({
      title: "Sample Act",
      question: "On Passage of the Bill",
      digest: {
        headline: "Aid package for allies",
        what_it_does: "Sends emergency funding to partner nations.",
        key_points: [],
        terms_explained: [],
      },
      rawSummaryText: null,
    });

    expect(prompt).toEqual({
      headline: "Aid package for allies",
      snippet: "Sends emergency funding to partner nations.",
    });
  });

  it("skips procedural votes", () => {
    const prompt = buildGamePrompt({
      title: "Providing for consideration of the bill (H.R. 1), to rebuild roads",
      question: "On agreeing to the resolution",
      digest: null,
      rawSummaryText: null,
    });

    expect(prompt).toBeNull();
  });

  it("skips text that leaks the outcome", () => {
    const prompt = buildGamePrompt({
      title: "Sample Act",
      question: "On Passage of the Bill",
      digest: {
        headline: "The bill passed the Senate yesterday",
        what_it_does: "Creates a new grant program.",
        key_points: [],
        terms_explained: [],
      },
      rawSummaryText: null,
    });

    expect(prompt).toBeNull();
  });

  it("classifies vote results", () => {
    expect(getGameCorrectAnswer("Passed")).toBe("passed");
    expect(getGameCorrectAnswer("Rejected")).toBe("failed");
    expect(voteIndicatesFailure("Not agreed to")).toBe(true);
  });
});
