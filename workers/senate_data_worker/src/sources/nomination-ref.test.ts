import { describe, expect, it } from "vitest";
import {
  nominationApiNumber,
  nominationCitation,
  parseSenateNominationIssue,
} from "./nomination-ref";

describe("parseSenateNominationIssue", () => {
  it("parses partitioned nominations", () => {
    expect(parseSenateNominationIssue("PN851-4", 119)).toEqual({
      congress: 119,
      number: 851,
      partNumber: 4,
    });
  });

  it("parses non-partitioned nominations", () => {
    expect(parseSenateNominationIssue("PN100", 119)).toEqual({
      congress: 119,
      number: 100,
      partNumber: 0,
    });
  });

  it("tolerates whitespace after PN", () => {
    expect(parseSenateNominationIssue("PN 12-1", 118)).toEqual({
      congress: 118,
      number: 12,
      partNumber: 1,
    });
  });

  it("rejects bills and empty strings", () => {
    expect(parseSenateNominationIssue("S. 2", 119)).toBeNull();
    expect(parseSenateNominationIssue("H.R. 1", 119)).toBeNull();
    expect(parseSenateNominationIssue("", 119)).toBeNull();
  });
});

describe("nominationCitation / nominationApiNumber", () => {
  it("formats partitioned and plain citations", () => {
    expect(nominationCitation({ number: 851, partNumber: 4 })).toBe("PN851-4");
    expect(nominationCitation({ number: 100, partNumber: 0 })).toBe("PN100");
    expect(nominationApiNumber({ number: 851, partNumber: 4 })).toBe("851-4");
    expect(nominationApiNumber({ number: 100, partNumber: 0 })).toBe("100");
  });
});
