import { describe, expect, it } from "vitest";
import { rollCrossVotes } from "./cross-votes";

describe("rollCrossVotes", () => {
  it("returns members who voted against their party majority", () => {
    const crosses = rollCrossVotes([
      { bioguideId: "R1", party: "R", position: "Yea" },
      { bioguideId: "R2", party: "R", position: "Nay" },
      { bioguideId: "R3", party: "R", position: "Nay" },
      { bioguideId: "D1", party: "D", position: "Yea" },
      { bioguideId: "D2", party: "D", position: "Yea" },
    ]);

    expect(crosses).toEqual([{ bioguideId: "R1", position: "yea", partyLine: "nay" }]);
  });

  it("skips members without a party or non yea/nay positions", () => {
    const crosses = rollCrossVotes([
      { bioguideId: "R1", party: "R", position: "Present" },
      { bioguideId: "X1", party: null, position: "Yea" },
      { bioguideId: "R2", party: "R", position: "Nay" },
    ]);

    expect(crosses).toEqual([]);
  });
});
