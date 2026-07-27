import { describe, expect, it } from "vitest";
import {
  FEED_TOPIC_HEADLINE_MAX_CHARS,
  formatCollapsedDigestLead,
  formatFeedTopicHeadline,
  normalizeDigestLead,
  proceduralHeadline,
  trimDisplayTitle,
  truncateAtSentenceBoundary,
  voteIndicatesFailure,
} from "./feed-content";

describe("feed-content helpers", () => {
  it("classifies vote results", () => {
    expect(voteIndicatesFailure("Not agreed to")).toBe(true);
  });

  it("rewrites nullification resolutions", () => {
    const title =
      "Providing that section 11 of House Resolution 1224 shall have no force or effect.";

    expect(proceduralHeadline(title)).toBe("Nullifies section 11 of H.Res. 1224");
  });

  it("rewrites providing-for-consideration rule resolutions", () => {
    const title =
      "Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.";

    expect(proceduralHeadline(title)).toBe(
      "Sets up House debate on H.R. 2913: Authorize support for Ukraine",
    );
  });

  it("rewrites rule-waiver resolutions", () => {
    const title =
      "Waiving a requirement of clause 6(a) of rule XIII with respect to consideration of certain resolutions reported from the Committee on Rules.";

    expect(proceduralHeadline(title)).toBe("Fast-tracks floor consideration (rule waiver)");
  });

  it("returns null for non-matching titles", () => {
    expect(proceduralHeadline("A regular bill title about infrastructure.")).toBeNull();
  });

  it("removes the boilerplate title suffix", () => {
    expect(trimDisplayTitle("Authorize support for Ukraine, and for other purposes.")).toBe(
      "Authorize support for Ukraine",
    );
    expect(trimDisplayTitle("Sample bill and for other purposes.")).toBe("Sample bill");
  });

  describe("formatFeedTopicHeadline", () => {
    it("leaves short titles untouched", () => {
      expect(formatFeedTopicHeadline("Authorize support for Ukraine")).toBe(
        "Authorize support for Ukraine",
      );
    });

    it("strips To / A bill to / An act to prefixes and capitalizes the remainder", () => {
      expect(
        formatFeedTopicHeadline(
          "To authorize appropriations for fiscal year 2026 for military activities.",
        ),
      ).toBe("Authorize appropriations for fiscal year 2026 for military activities.");
      expect(formatFeedTopicHeadline("A bill to improve veterans' healthcare access.")).toBe(
        "Improve veterans' healthcare access.",
      );
      expect(formatFeedTopicHeadline("An act to designate a national memorial.")).toBe(
        "Designate a national memorial.",
      );
    });

    it("does not strip Condemning or Directing prefixes", () => {
      expect(
        formatFeedTopicHeadline(
          "Directing the President pursuant to section 5(c) of the War Powers Resolution to remove United States Armed Forces from hostilities in Lebanon.",
        ).startsWith("Directing "),
      ).toBe(true);
      expect(
        formatFeedTopicHeadline(
          "Condemning actors seeking to defraud the United States Government, and expressing the sense of the House.",
        ).startsWith("Condemning "),
      ).toBe(true);
    });

    it("truncates long titles at a clause boundary before the topic char budget", () => {
      const title =
        "Condemning actors seeking to defraud the United States Government, and expressing the sense of the House of Representatives that governmentwide fraud and improper payment prevention reforms will meaningfully improve the fiscal state of the United States.";

      expect(formatFeedTopicHeadline(title)).toBe(
        "Condemning actors seeking to defraud the United States Government…",
      );
      expect(formatFeedTopicHeadline(title).endsWith("…")).toBe(true);
      expect(formatFeedTopicHeadline(title).length).toBeLessThanOrEqual(
        FEED_TOPIC_HEADLINE_MAX_CHARS + 1,
      );
    });

    it("truncates at a word boundary when no usable clause break exists", () => {
      const title =
        "Directing the President pursuant to section 5(c) of the War Powers Resolution to remove United States Armed Forces from hostilities in Lebanon.";

      const result = formatFeedTopicHeadline(title);
      expect(result.endsWith("…")).toBe(true);
      expect(result.includes(",")).toBe(false);
      expect(result.length).toBeLessThan(title.length);
      // Never mid-word: last character before ellipsis is end of a full word.
      expect(result.slice(0, -1)).toMatch(/\S$/);
      expect(result.slice(0, -1).split(/\s+/).every((word) => word.length > 0)).toBe(true);
    });

    it("never cuts mid-word", () => {
      const title =
        "Appropriating emergency supplemental funding for disaster relief operations across multiple federal agencies during the current fiscal year without delay";
      const result = formatFeedTopicHeadline(title);
      expect(result.endsWith("…")).toBe(true);
      const withoutEllipsis = result.slice(0, -1);
      expect(title.startsWith(withoutEllipsis)).toBe(true);
      expect(withoutEllipsis.endsWith(" ")).toBe(false);
      const nextChar = title.charAt(withoutEllipsis.length);
      expect(nextChar === " " || nextChar === "").toBe(true);
    });

    it("collapses internal whitespace", () => {
      expect(formatFeedTopicHeadline("  Authorize   support\nfor   Ukraine  ")).toBe(
        "Authorize support for Ukraine",
      );
    });
  });

  it("normalizes digest leads at ingest and formats collapsed teasers", () => {
    const lead = normalizeDigestLead(
      "This bill blocks aid for ghost students. It also creates reporting rules and audit requirements."
    );
    expect(lead).toBe("This bill blocks aid for ghost students.");
    expect(formatCollapsedDigestLead(lead)).toBe("This bill blocks aid for ghost students.");
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

  it("truncates at sentence boundaries without cutting on U.S. abbreviations", () => {
    const lead = "Word ".repeat(150).trim();
    const input = `${lead} The act directs the U.S. Department of Energy to publish rules after enactment.`;
    const cutBudget = lead.length + " The act directs the U.S. Dep".length;
    const out = truncateAtSentenceBoundary(input, cutBudget);
    expect(out.endsWith("U.S.")).toBe(false);
    expect(out.endsWith("…")).toBe(true);
  });
});
