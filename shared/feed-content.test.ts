import { describe, expect, it } from "vitest";
import {
  formatCollapsedDigestLead,
  formatExpandedCrsLead,
  normalizeDigestLead,
  proceduralHeadline,
  trimDisplayTitle,
  truncateAtSentenceBoundary,
  voteIndicatesFailure,
} from "./feed-content";
import { splitSentences } from "./digest-format";

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

  it("normalizes digest leads at ingest and formats collapsed teasers", () => {
    const lead = normalizeDigestLead(
      "This bill blocks aid for ghost students. It also creates reporting rules and audit requirements."
    );
    expect(lead).toBe("This bill blocks aid for ghost students.");
    expect(formatCollapsedDigestLead(lead)).toBe("This bill blocks aid for ghost students.");
  });

  it("formats expanded CRS leads as one complete sentence without the 25-word teaser cut", () => {
    const crs =
      "This concurrent resolution directs the President to remove U.S. Armed Forces from hostilities against Iran or any part of its government or military unless a declaration of war or specific statutory authorization has been enacted. Congress retains the power to authorize force.";
    expect(formatExpandedCrsLead(crs)).toBe(
      "This concurrent resolution directs the President to remove U.S. Armed Forces from hostilities against Iran or any part of its government or military unless a declaration of war or specific statutory authorization has been enacted.",
    );
    expect(formatExpandedCrsLead(crs).endsWith("…")).toBe(false);
    expect(formatCollapsedDigestLead(crs).endsWith("…")).toBe(true);
  });

  it("keeps expanded CRS leads short for multi-paragraph budget resolutions", () => {
    const crs = `This concurrent resolution establishes the congressional budget for the federal government for FY2027, sets forth budgetary levels for FY2028-FY2036, and provides reconciliation instructions for legislation that increases the deficit.
The resolution recommends levels and amounts for FY2027-FY2036 for federal revenues and new budget authority.`;
    const lead = formatExpandedCrsLead(crs);
    expect(lead).toBe(
      "This concurrent resolution establishes the congressional budget for the federal government for FY2027, sets forth budgetary levels for FY2028-FY2036, and provides reconciliation instructions for legislation that increases the deficit.",
    );
    expect(lead.length).toBeLessThan(crs.length);
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

  it("does not cut the first sentence on a name initial", () => {
    expect(
      formatCollapsedDigestLead(
        "Erica G. Schwartz is an American health official. She was Deputy Surgeon General."
      )
    ).toBe("Erica G. Schwartz is an American health official.");
  });

  it("splits sentences without breaking on name initials or abbreviations", () => {
    expect(
      splitSentences(
        "Erica G. Schwartz was nominated to serve as Director of the Centers for Disease Control and Prevention."
      )
    ).toHaveLength(1);
    expect(
      splitSentences(
        "Jane Doe led U.S. grid programs. She previously chaired the state commission."
      )
    ).toEqual([
      "Jane Doe led U.S. grid programs.",
      "She previously chaired the state commission.",
    ]);
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
