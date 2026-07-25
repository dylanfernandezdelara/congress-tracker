import { describe, expect, it } from "vitest";
import {
  partyMajoritiesForRoll,
  partyTalliesForRoll,
  rollPartySplits,
} from "./roll-party-stats";

/** H.R. 7008 roll 280: near-unanimous R yea, lopsided D nay with 13 crossovers. */
function hr7008Positions() {
  const positions: Array<{ party: string | null; position: string }> = [];
  for (let i = 0; i < 218; i += 1) positions.push({ party: "R", position: "Yea" });
  for (let i = 0; i < 13; i += 1) positions.push({ party: "D", position: "Yea" });
  for (let i = 0; i < 198; i += 1) positions.push({ party: "D", position: "Nay" });
  return positions;
}

describe("partyTalliesForRoll", () => {
  it("counts yea and nay per party", () => {
    expect(partyTalliesForRoll(hr7008Positions())).toEqual(
      new Map([
        ["R", { yea: 218, nay: 0 }],
        ["D", { yea: 13, nay: 198 }],
      ])
    );
  });

  it("ignores unknown parties and non-voting positions", () => {
    const tallies = partyTalliesForRoll([
      { party: null, position: "Yea" },
      { party: "R", position: "Not Voting" },
      { party: "R", position: "Present" },
      { party: "R", position: "Nay" },
    ]);
    expect(tallies).toEqual(new Map([["R", { yea: 0, nay: 1 }]]));
  });
});

describe("partyMajoritiesForRoll", () => {
  it("resolves each party's line and treats a tie as yea", () => {
    const majorities = partyMajoritiesForRoll([
      { party: "R", position: "Yea" },
      { party: "R", position: "Nay" },
      { party: "D", position: "Nay" },
    ]);
    expect(majorities.get("R")).toBe("yea");
    expect(majorities.get("D")).toBe("nay");
  });
});

describe("rollPartySplits", () => {
  it("orders by votes cast and reports the party line", () => {
    expect(rollPartySplits(hr7008Positions())).toEqual([
      { party: "R", yeas: 218, nays: 0, party_line: "yea" },
      { party: "D", yeas: 13, nays: 198, party_line: "nay" },
    ]);
  });

  it("omits parties that cast no yea or nay", () => {
    expect(
      rollPartySplits([
        { party: "I", position: "Not Voting" },
        { party: "D", position: "Yea" },
      ])
    ).toEqual([{ party: "D", yeas: 1, nays: 0, party_line: "yea" }]);
  });

  it("returns an empty list when no member positions are known", () => {
    expect(rollPartySplits([])).toEqual([]);
  });
});
