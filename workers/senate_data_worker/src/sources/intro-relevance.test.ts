import { describe, expect, it } from "vitest";
import {
  compareIntroRelevance,
  hasNamedActShape,
  hasSubstantiveTitleToken,
  isHardExcludedIntro,
  isJunkIntroTitle,
  PROMINENT_INTRO_SPONSOR_BIOGUIDES,
  scoreIntroRelevance,
  selectIntroPersistSet,
} from "./intro-relevance";

describe("hard excludes", () => {
  it("drops private relief titles", () => {
    expect(isJunkIntroTitle("For the relief of Jane Doe")).toBe(true);
    expect(isHardExcludedIntro({ title: "For the relief of Jane Doe", policyArea: null, primarySponsorBioguide: null })).toBe(
      true
    );
  });

  it("drops USPS / Post Office facility designation titles", () => {
    expect(
      isJunkIntroTitle(
        "To designate the facility of the United States Postal Service located at 100 Main Street as the Jane Doe Post Office Building"
      )
    ).toBe(true);
    expect(
      isJunkIntroTitle("A bill to name the USPS facility at 12 Pine as the John Smith Post Office Building")
    ).toBe(true);
  });

  it("does not hard-drop a USPS policy title that uses designate or name", () => {
    expect(isJunkIntroTitle("United States Postal Service Reform Act")).toBe(false);
    expect(
      isHardExcludedIntro({
        title: "To designate the United States Postal Service as a critical infrastructure agency",
        policyArea: "Government Operations and Politics",
        primarySponsorBioguide: null,
      })
    ).toBe(false);
    expect(isJunkIntroTitle("USPS Privacy Protection Act")).toBe(false);
  });

  it("drops commemorative coin/medal/stamp-only and pure Gold Medal honors", () => {
    expect(isJunkIntroTitle("To provide for the minting of a commemorative coin honoring Jane Doe")).toBe(
      true
    );
    expect(isJunkIntroTitle("To award a Congressional Gold Medal to Jane Doe")).toBe(true);
  });

  it("drops Private Legislation policy when detail has it", () => {
    expect(
      isHardExcludedIntro({
        title: "A bill relating to an individual",
        policyArea: "Private Legislation",
        primarySponsorBioguide: null,
      })
    ).toBe(true);
  });

  it("does not hard-drop a named Act that merely mentions a gold medal", () => {
    expect(
      isJunkIntroTitle("National Security Authorization Act of 2026 including a Congressional Gold Medal")
    ).toBe(false);
  });

  it("drops a pure Gold Medal Act vehicle and keeps one with leftover substance", () => {
    expect(isJunkIntroTitle("Jane Doe Congressional Gold Medal Act")).toBe(true);
    expect(isJunkIntroTitle("National Security Congressional Gold Medal Act")).toBe(false);
  });

  it("does not hard-drop a named Act that merely mentions a commemorative coin", () => {
    expect(isJunkIntroTitle("Housing Reform Act including a commemorative coin")).toBe(false);
  });
});

describe("soft score (rank only)", () => {
  it("scores Ban Artificial Superintelligence Act + Sanders above a generic title", () => {
    const asi = scoreIntroRelevance({
      title: "Ban Artificial Superintelligence Act",
      policyArea: null,
      primarySponsorBioguide: "S000033",
    });
    const generic = scoreIntroRelevance({
      title: "A bill to amend title 5",
      policyArea: null,
      primarySponsorBioguide: null,
    });
    expect(hasNamedActShape("Ban Artificial Superintelligence Act")).toBe(true);
    expect(hasSubstantiveTitleToken("Ban Artificial Superintelligence Act")).toBe(true);
    expect(PROMINENT_INTRO_SPONSOR_BIOGUIDES.has("S000033")).toBe(true);
    expect(PROMINENT_INTRO_SPONSOR_BIOGUIDES.has("C001125")).toBe(true);
    expect(asi).toBeGreaterThanOrEqual(7);
    expect(asi).toBeGreaterThan(generic);
  });

  it("fails open when policyArea and sponsor are missing", () => {
    expect(
      isHardExcludedIntro({
        title: "Housing Reform Act",
        policyArea: null,
        primarySponsorBioguide: null,
      })
    ).toBe(false);
    expect(
      scoreIntroRelevance({
        title: "Housing Reform Act",
        policyArea: null,
        primarySponsorBioguide: null,
      })
    ).toBeGreaterThan(0);
  });

  it("does not drop a low-score survivor — rank only", () => {
    const low = {
      score: scoreIntroRelevance({
        title: "A bill to amend title 5",
        policyArea: null,
        primarySponsorBioguide: null,
      }),
      introducedDate: "2026-09-01",
      number: 1,
    };
    const high = {
      score: scoreIntroRelevance({
        title: "Ban Artificial Superintelligence Act",
        policyArea: null,
        primarySponsorBioguide: "S000033",
      }),
      introducedDate: "2026-09-01",
      number: 9901,
    };
    expect(low.score).toBe(0);
    expect(compareIntroRelevance(high, low)).toBeLessThan(0);
  });

  it("selectIntroPersistSet ranks then caps without dropping under-cap survivors", () => {
    const kept = selectIntroPersistSet(
      [
        {
          title: "A bill to amend title 5",
          policyArea: null,
          primarySponsorBioguide: null,
          introducedDate: "2026-09-02",
          number: 3,
        },
        {
          title: "Ban Artificial Superintelligence Act",
          policyArea: null,
          primarySponsorBioguide: "S000033",
          introducedDate: "2026-09-01",
          number: 9901,
        },
      ],
      12
    );
    expect(kept.map((item) => item.number)).toEqual([9901, 3]);
  });
});
