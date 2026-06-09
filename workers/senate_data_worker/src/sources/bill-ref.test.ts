import { describe, expect, it } from "vitest";
import { parseHouseLegislation, parseSenateIssue } from "./bill-ref";

describe("parseSenateIssue", () => {
  it("parses Senate bills", () => {
    expect(parseSenateIssue("S. 1318", 119)).toEqual({ congress: 119, type: "S", number: 1318 });
  });

  it("skips nominations", () => {
    expect(parseSenateIssue("PN851-4", 119)).toBeNull();
  });
});

describe("parseHouseLegislation", () => {
  it("parses house resolution", () => {
    expect(parseHouseLegislation("HRES", "1075", 119)).toEqual({
      congress: 119,
      type: "HRES",
      number: 1075,
    });
  });
});
