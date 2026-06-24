import { describe, expect, it } from "vitest";
import {
  displayNameFromInverted,
  normalizeStateCode,
  parseCongressMemberListItem,
} from "./congress-member-roster";

describe("parseCongressMemberListItem", () => {
  it("parses a House member from Congress.gov list shape", () => {
    const member = parseCongressMemberListItem({
      bioguideId: "G000607",
      name: "Gallagher, James",
      partyName: "Republican",
      state: "California",
      district: 1,
      terms: {
        item: [{ chamber: "House of Representatives", startYear: 2026 }],
      },
    });

    expect(member).toEqual({
      bioguideId: "G000607",
      name: "James Gallagher",
      chamber: "House",
      party: "R",
      state: "CA",
      district: 1,
    });
  });

  it("parses a Senate member and clears district", () => {
    const member = parseCongressMemberListItem({
      bioguideId: "B001288",
      name: "Booker, Cory A.",
      partyName: "Democratic",
      state: "New Jersey",
      district: null,
      terms: {
        item: [{ chamber: "Senate", startYear: 2013 }],
      },
    });

    expect(member).toMatchObject({
      bioguideId: "B001288",
      chamber: "Senate",
      party: "D",
      state: "NJ",
      district: null,
    });
  });
});

describe("normalizeStateCode", () => {
  it("accepts two-letter codes and full state names", () => {
    expect(normalizeStateCode("tx")).toBe("TX");
    expect(normalizeStateCode("Texas")).toBe("TX");
  });
});

describe("displayNameFromInverted", () => {
  it("converts last-first names to display order", () => {
    expect(displayNameFromInverted("Booker, Cory A.")).toBe("Cory A. Booker");
  });
});
