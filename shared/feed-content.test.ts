import { describe, expect, it } from "vitest";
import {
  buildFeedSummaryParts,
  normalizeDigestLead,
  proceduralHeadline,
  trimDisplayTitle,
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
