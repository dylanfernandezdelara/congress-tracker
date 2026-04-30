import { describe, expect, it } from "vitest";
import { buildBriefingFeedResponse, buildVoteDetailResponse } from "./read-model";
import type { ActivityIndexJson, SessionOverview, VoteLedger } from "./types";

const ledger: VoteLedger = {
  congress: 119,
  session: 2,
  generated_at: "2026-01-20T12:00:00Z",
  total_votes: 2,
  entries: [
    {
      vote_number: 14,
      vote_date: "2026-01-17",
      title: "Border Infrastructure Modernization Act",
      question: "On Passage of the Bill",
      result: "Agreed to",
      issue: "S. 303",
      member_votes: {
        D1: "Nay",
        D2: "Nay",
        R1: "Yea",
        R2: "Yea",
      },
    },
    {
      vote_number: 12,
      vote_date: "2026-01-15",
      title: "Clean Transit Access Act",
      question: "On Passage of the Bill",
      result: "Agreed to",
      issue: "S. 210",
      member_votes: {
        D1: "Yea",
        D2: "Yea",
        R1: "Nay",
        R2: "Yea",
      },
    },
  ],
};

const overview: SessionOverview = {
  congress: 119,
  session: 2,
  generated_at: "2026-01-20T12:00:00Z",
  total_votes: 2,
  latest_vote_date: "2026-01-17",
  total_defections: 1,
  senators: [
    { bioguide_id: "D1", name: "Alpha, Dana", party: "D", state: "NY", votes_cast: 2, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
    { bioguide_id: "D2", name: "Beta, Drew", party: "D", state: "CA", votes_cast: 2, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
    { bioguide_id: "R1", name: "Gamma, Riley", party: "R", state: "TX", votes_cast: 2, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
    { bioguide_id: "R2", name: "Delta, Rowan", party: "R", state: "UT", votes_cast: 2, votes_missed: 0, party_defections: 1, alignment_pct: 50 },
  ],
};

const activities: ActivityIndexJson = {
  generated_at: "2026-01-20T12:00:00Z",
  window: { start_date: "2026-01-10", end_date: "2026-01-20" },
  activities: [
    {
      activity_id: "senate:roll_call_vote:2026-01-17:14",
      source: "senate",
      type: "roll_call_vote",
      date: "2026-01-17",
      title: "Border Infrastructure Modernization Act",
      bill: {
        congress: 119,
        type: "S",
        number: "303",
        title: "Border Infrastructure Modernization Act",
        policy_area: "Immigration",
        analysis: {
          plain_title: "Upgrade border crossing infrastructure",
          plain_summary: "Funds major improvements at border entry points.",
          key_provisions: [],
          why_it_matters: "Important national infrastructure vote.",
          hidden_provisions: null,
          significance: "high",
          significance_reason: "National security and commerce implications.",
          category: "Border Security",
          affects: ["Travelers"],
        },
      },
      members: ["D1", "D2", "R1", "R2"],
    },
    {
      activity_id: "senate:roll_call_vote:2026-01-15:12",
      source: "senate",
      type: "roll_call_vote",
      date: "2026-01-15",
      title: "Clean Transit Access Act",
      bill: {
        congress: 119,
        type: "S",
        number: "210",
        title: "Clean Transit Access Act",
        policy_area: "Transportation",
        analysis: {
          plain_title: "Cleaner buses for public transit",
          plain_summary: "Creates grants to modernize transit fleets.",
          key_provisions: [],
          why_it_matters: "Public-transit funding vote.",
          hidden_provisions: null,
          significance: "high",
          significance_reason: "Broad public-transit impact.",
          category: "Public Transit",
          affects: ["Transit riders"],
        },
      },
      members: ["D1", "D2", "R1", "R2"],
    },
  ],
};

describe("read-model builders", () => {
  it("orders briefing feed votes by newest roll call first", () => {
    const briefing = buildBriefingFeedResponse(ledger, overview, activities);
    expect(briefing.items).toHaveLength(2);
    expect(briefing.items[0].vote_number).toBe(14);
    expect(briefing.items[0].ranking_reasons.some((reason) => reason.code === "close_vote")).toBe(true);
  });

  it("builds vote detail with crossovers and recurrence context", () => {
    const detail = buildVoteDetailResponse(ledger, overview, activities, 12);
    expect(detail).not.toBeNull();
    expect(detail?.crossovers).toHaveLength(1);
    expect(detail?.history.measure_recurrence_count).toBe(1);
    expect(detail?.history.issue_recurrence_count).toBe(1);
    expect(detail?.party_breakdown.find((party) => party.party === "R")?.nay).toBe(1);
  });

  it("explains procedural votes when bill context is missing", () => {
    const proceduralLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 1,
      entries: [
        {
          vote_number: 5,
          vote_date: "2026-01-18",
          title: "Motion to Discharge S.J.Res. 98",
          question: "Motion to Discharge S.J.Res. 98",
          result: "Agreed to",
          issue: "S.J.Res. 98",
          member_votes: {
            D1: "Yea",
            D2: "Yea",
            R1: "Nay",
            R2: "Yea",
          },
        },
      ],
    };

    const briefing = buildBriefingFeedResponse(proceduralLedger, overview, null);
    expect(briefing.items[0].category).toBe("Floor Procedure");
    expect(briefing.items[0].summary).toContain("procedural step");
    expect(briefing.items[0].summary).toContain("not final passage");
  });

  it("does not mark routine district-judge confirmations as institutionally significant by default", () => {
    const nominationLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 1,
      entries: [
        {
          vote_number: 26,
          vote_date: "2026-01-19",
          title:
            "Confirmation: Aaron Christian Peterson, of Alaska, to be United States District Judge for the District of Alaska",
          question: "On the Nomination",
          result: "Confirmed",
          issue: "PN42",
          member_votes: {
            D1: "Yea",
            D2: "Nay",
            R1: "Yea",
            R2: "Yea",
          },
        },
      ],
    };

    const briefing = buildBriefingFeedResponse(nominationLedger, overview, null);
    expect(briefing.items[0].ranking_reasons.some((reason) => reason.code === "institutional")).toBe(false);
  });
});
