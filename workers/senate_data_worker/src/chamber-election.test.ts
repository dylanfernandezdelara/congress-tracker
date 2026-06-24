import { describe, expect, it } from "vitest";
import {
  congressStartYear,
  electionYearForCongress,
  seatsUpForElection,
  senateClassForElectionYear,
} from "../../../shared/chamber-election";

describe("chamber-election", () => {
  it("maps 119th Congress to 2026 election", () => {
    expect(congressStartYear(119)).toBe(2025);
    expect(electionYearForCongress(119)).toBe(2026);
  });

  it("returns all House seats for midterms", () => {
    expect(seatsUpForElection("House", 119)).toEqual({
      seats_up_for_election: 435,
      election_year: 2026,
    });
  });

  it("returns Class 2 Senate seats for 2026", () => {
    expect(senateClassForElectionYear(2026)).toBe(2);
    expect(seatsUpForElection("Senate", 119)).toEqual({
      seats_up_for_election: 33,
      election_year: 2026,
    });
  });

  it("rotates Senate classes by election year", () => {
    expect(senateClassForElectionYear(2024)).toBe(1);
    expect(senateClassForElectionYear(2028)).toBe(3);
    expect(seatsUpForElection("Senate", 118)).toEqual({
      seats_up_for_election: 33,
      election_year: 2024,
    });
  });
});
