import { describe, expect, it } from "vitest";
import { parseHouseLegislation, parseSenateIssue } from "./bill-ref";

describe("parseSenateIssue", () => {
  it("parses Senate bills", () => {
    expect(parseSenateIssue("S. 1318", 119)).toEqual({ congress: 119, type: "S", number: 1318 });
  });

  it("parses every bill and resolution type, including joint and concurrent resolutions", () => {
    const cases: Array<[string, string, number]> = [
      ["H.R. 6644", "HR", 6644],
      ["S.Res. 817", "SRES", 817],
      ["H.Res. 5", "HRES", 5],
      ["S.J.Res. 197", "SJRES", 197],
      ["H.J.Res. 142", "HJRES", 142],
      ["S.Con.Res. 12", "SCONRES", 12],
      ["H.Con.Res. 93", "HCONRES", 93],
    ];
    for (const [issue, type, number] of cases) {
      expect(parseSenateIssue(issue, 119)).toEqual({ congress: 119, type, number });
    }
  });

  it("skips nominations and non-bill issues", () => {
    expect(parseSenateIssue("Treaty Doc. 118-2", 119)).toBeNull();
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
