import { describe, expect, it } from "vitest";
import {
  buildFeedSummaryParts,
  buildGamePrompt,
  getGameCorrectAnswer,
  normalizeDigestLead,
  proceduralHeadline,
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
    expect(getGameCorrectAnswer("Withdrawn")).toBeNull();
    expect(voteIndicatesFailure("Not agreed to")).toBe(true);
  });

  it("rewrites nullification resolutions", () => {
    const title =
      "Providing that section 11 of House Resolution 1224 shall have no force or effect.";

    expect(proceduralHeadline(title)).toBe("Nullifies section 11 of H.Res. 1224");
  });

  it("normalizes digest leads at ingest and builds collapsed feed summaries", () => {
    const lead = normalizeDigestLead(
      "This bill blocks aid for ghost students. It also creates reporting rules and audit requirements."
    );
    expect(lead).toBe("This bill blocks aid for ghost students.");

    const parts = buildFeedSummaryParts({
      whatItDoes: lead,
      keyPoints: ["Requires campus verification", "Adds annual reporting"],
    });
    expect(parts).toEqual({
      lead: "This bill blocks aid for ghost students.",
      bullets: ["Requires campus verification", "Adds annual reporting"],
    });
  });

  it("does not show raw CRS on the collapsed card when no digest exists", () => {
    const parts = buildFeedSummaryParts({
      whatItDoes: null,
      keyPoints: null,
    });
    expect(parts).toBeNull();
  });

  it("preserves common abbreviations when extracting the first sentence", () => {
    expect(
      normalizeDigestLead(
        "This bill amends the U.S. Code to block federal aid. It also adds reporting rules."
      )
    ).toBe("This bill amends the U.S. Code to block federal aid.");
    expect(
      normalizeDigestLead("Appropriates $1.5 billion for defense programs. Oversight follows.")
    ).toBe("Appropriates $1.5 billion for defense programs.");
    expect(
      normalizeDigestLead("Requires compliance with Sec. 401 of the FAA. More rules follow.")
    ).toBe("Requires compliance with Sec. 401 of the FAA.");
    expect(
      normalizeDigestLead("Amends Title 18 U.S.C. Section 401 to add penalties. More follows.")
    ).toBe("Amends Title 18 U.S.C. Section 401 to add penalties.");
  });
});
