import { describe, expect, it } from "vitest";
import { parseBillQuery, parseBillQueryList } from "./parse-bill-query";

describe("parseBillQuery", () => {
  it("parses common bill identifiers", () => {
    expect(parseBillQuery("HR1234", 119)).toEqual({ congress: 119, type: "HR", number: 1234 });
    expect(parseBillQuery("H.R. 1234", 119)).toEqual({ congress: 119, type: "HR", number: 1234 });
    expect(parseBillQuery("S. 2", 119)).toEqual({ congress: 119, type: "S", number: 2 });
    expect(parseBillQuery("H.Res. 512", 119)).toEqual({ congress: 119, type: "HRES", number: 512 });
  });

  it("returns null for invalid identifiers", () => {
    expect(parseBillQuery("not-a-bill", 119)).toBeNull();
    expect(parseBillQuery("", 119)).toBeNull();
  });
});

describe("parseBillQueryList", () => {
  it("deduplicates bills from comma-separated values", () => {
    expect(parseBillQueryList(["HR1234, S.2", "HR1234"], 119)).toEqual([
      { congress: 119, type: "HR", number: 1234 },
      { congress: 119, type: "S", number: 2 },
    ]);
  });
});
