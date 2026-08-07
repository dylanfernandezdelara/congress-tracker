import { describe, expect, it } from "vitest";
import { parseBillSponsors } from "./congress-client";

describe("parseBillSponsors", () => {
  it("keeps primary sponsors with bioguide + normalized state", () => {
    expect(
      parseBillSponsors([
        {
          bioguideId: "G000555",
          state: "ny",
          fullName: "Rep. Example [D-NY-10]",
          party: "D",
        },
        {
          bioguideId: "G000555",
          state: "NY",
          fullName: "duplicate",
          party: "D",
        },
        { bioguideId: "X000001", state: "ZZ" },
        { bioguideId: "X000002" },
        { state: "CA" },
      ])
    ).toEqual([
      {
        bioguideId: "G000555",
        state: "NY",
        fullName: "Rep. Example [D-NY-10]",
        party: "D",
        isPrimary: true,
      },
    ]);
  });

  it("returns an empty list when sponsors are missing", () => {
    expect(parseBillSponsors(undefined)).toEqual([]);
    expect(parseBillSponsors([])).toEqual([]);
  });
});
