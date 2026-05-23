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
  it("matches harness expectation: newest roll call leads the briefing (119:2:14)", () => {
    const harnessOverview: SessionOverview = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 3,
      latest_vote_date: "2026-01-17",
      total_defections: 4,
      senators: [
        {
          bioguide_id: "S000148",
          name: "Schumer, Charles E.",
          party: "D",
          state: "NY",
          votes_cast: 3,
          votes_missed: 0,
          party_defections: 0,
          alignment_pct: 100,
        },
        {
          bioguide_id: "G000555",
          name: "Gillibrand, Kirsten E.",
          party: "D",
          state: "NY",
          votes_cast: 3,
          votes_missed: 0,
          party_defections: 0,
          alignment_pct: 100,
        },
        {
          bioguide_id: "C001098",
          name: "Cruz, Ted",
          party: "R",
          state: "TX",
          votes_cast: 3,
          votes_missed: 0,
          party_defections: 2,
          alignment_pct: 50,
        },
        {
          bioguide_id: "C001056",
          name: "Cornyn, John",
          party: "R",
          state: "TX",
          votes_cast: 3,
          votes_missed: 0,
          party_defections: 1,
          alignment_pct: 75,
        },
      ],
    };

    const harnessLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 3,
      entries: [
        {
          vote_number: 12,
          vote_date: "2026-01-15",
          title: "S. 210 - Clean Transit Access Act",
          question: "On Passage of the Bill",
          result: "Agreed to",
          issue: "S. 210",
          member_votes: {
            S000148: "Yea",
            G000555: "Yea",
            C001098: "Nay",
            C001056: "Yea",
          },
        },
        {
          vote_number: 13,
          vote_date: "2026-01-15",
          title: "S. 198 - Veterans Housing Stability Act",
          question: "On the Motion to Invoke Cloture",
          result: "Agreed to",
          issue: "S. 198",
          member_votes: {
            S000148: "Yea",
            G000555: "Yea",
            C001098: "Nay",
            C001056: "Yea",
          },
        },
        {
          vote_number: 14,
          vote_date: "2026-01-17",
          title: "S. 303 - Border Infrastructure Modernization Act",
          question: "On Passage of the Bill",
          result: "Agreed to",
          issue: "S. 303",
          member_votes: {
            S000148: "Nay",
            G000555: "Yea",
            C001098: "Yea",
            C001056: "Nay",
          },
        },
      ],
    };

    const harnessActivities: ActivityIndexJson = {
      generated_at: "2026-01-20T12:00:00Z",
      window: { start_date: "2026-01-10", end_date: "2026-01-20" },
      activities: [
        {
          activity_id: "senate:roll_call_vote:2026-01-15:12",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-15",
          title: "S. 210 - Clean Transit Access Act",
          bill: {
            congress: 119,
            type: "S",
            number: "210",
            title: "Clean Transit Access Act",
            summary: "Provides grants to modernize public transit fleets with zero-emission vehicles.",
            policy_area: "Transportation",
            subjects: ["Public transit", "Emissions"],
          },
          members: ["S000148", "G000555", "C001098", "C001056"],
        },
        {
          activity_id: "senate:roll_call_vote:2026-01-15:13",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-15",
          title: "S. 198 - Veterans Housing Stability Act",
          bill: {
            congress: 119,
            type: "S",
            number: "198",
            title: "Veterans Housing Stability Act",
            summary: "Expands housing assistance and rental vouchers for veterans at risk of homelessness.",
            policy_area: "Armed forces and national security",
            subjects: ["Veterans", "Housing"],
          },
          members: ["S000148", "G000555", "C001098", "C001056"],
        },
        {
          activity_id: "senate:roll_call_vote:2026-01-17:14",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-17",
          title: "S. 303 - Border Infrastructure Modernization Act",
          bill: {
            congress: 119,
            type: "S",
            number: "303",
            title: "Border Infrastructure Modernization Act",
            summary: "Funds upgrades to ports of entry along the southern and northern borders.",
            policy_area: "Immigration",
            subjects: ["Border security", "Infrastructure"],
          },
          members: ["S000148", "G000555", "C001098", "C001056"],
        },
      ],
    };

    const briefing = buildBriefingFeedResponse(harnessLedger, harnessOverview, harnessActivities);
    expect(briefing.items[0].id).toBe("119:2:14");
    expect(briefing.items[0].vote_number).toBe(14);
  });

  it("orders the briefing by vote date, then descending roll call number", () => {
    const briefing = buildBriefingFeedResponse(ledger, overview, activities);
    expect(briefing.items).toHaveLength(2);
    expect(briefing.items[0].vote_number).toBe(14);
    expect(briefing.items[1].vote_number).toBe(12);
    expect(Math.abs(briefing.items[0].tally.yea - briefing.items[0].tally.nay)).toBeLessThanOrEqual(5);
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
    expect(briefing.items[0].summary).toContain("out of committee");
    expect(briefing.items[0].summary).toContain("No official bill summary");
  });

  it("orders same-day votes by descending roll-call number when dates tie", () => {
    const budgetLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 2,
      entries: [
        {
          vote_number: 302,
          vote_date: "2026-01-18",
          title: "Fiscal Year 2026 Budget Resolution",
          question: "On Passage of the Resolution",
          result: "Agreed to",
          issue: "S.Con.Res. 33",
          member_votes: { D1: "Yea", D2: "Yea", R1: "Nay", R2: "Nay" },
        },
        {
          vote_number: 301,
          vote_date: "2026-01-18",
          title: "Motion to Waive Section 312 of the Congressional Budget Act re: S.Con.Res. 33",
          question: "On the Motion",
          result: "Agreed to",
          issue: "S.Con.Res. 33",
          member_votes: { D1: "Yea", D2: "Yea", R1: "Yea", R2: "Yea" },
        },
      ],
    };

    const budgetActivities: ActivityIndexJson = {
      generated_at: "2026-01-20T12:00:00Z",
      window: { start_date: "2026-01-10", end_date: "2026-01-20" },
      activities: [
        {
          activity_id: "senate:roll_call_vote:2026-01-18:302",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-18",
          title: "Fiscal Year 2026 Budget Resolution",
          bill: {
            congress: 119,
            type: "S.Con.Res.",
            number: "33",
            title: "Fiscal Year 2026 Budget Resolution",
            summary:
              "Establishes the congressional budget for fiscal years 2026 through 2035 and sets reconciliation instructions for committees.",
            policy_area: "Economics and Public Finance",
          },
          members: ["D1", "D2", "R1", "R2"],
        },
        {
          activity_id: "senate:roll_call_vote:2026-01-18:301",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-18",
          title: "Budget waiver motion",
          bill: {
            congress: 119,
            type: "S.Con.Res.",
            number: "33",
            title: "Fiscal Year 2026 Budget Resolution",
            summary:
              "Establishes the congressional budget for fiscal years 2026 through 2035 and sets reconciliation instructions for committees.",
            policy_area: "Economics and Public Finance",
          },
          members: ["D1", "D2", "R1", "R2"],
        },
      ],
    };

    const briefing = buildBriefingFeedResponse(budgetLedger, overview, budgetActivities);
    expect(briefing.items[0].vote_number).toBe(302);
    expect(briefing.items[0].content_confidence).toBe("high");
    expect(briefing.items.find((i) => i.vote_number === 301)?.content_confidence).toBe("low");
  });

  it("marks amendment votes as low content confidence when amendment text is unavailable", () => {
    const amendLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 2,
      entries: [
        {
          vote_number: 402,
          vote_date: "2026-01-19",
          title: "S.Con.Res. 33",
          question: "On Passage of the Resolution",
          result: "Agreed to",
          issue: "S.Con.Res. 33",
          member_votes: { D1: "Yea", D2: "Yea", R1: "Nay", R2: "Nay" },
        },
        {
          vote_number: 401,
          vote_date: "2026-01-19",
          title: "S.Amdt. 5333 to S.Con.Res. 33",
          question: "On the Amendment",
          result: "Agreed to",
          issue: "S.Con.Res. 33",
          member_votes: { D1: "Yea", D2: "Nay", R1: "Yea", R2: "Nay" },
        },
      ],
    };

    const amendActivities: ActivityIndexJson = {
      generated_at: "2026-01-20T12:00:00Z",
      window: { start_date: "2026-01-10", end_date: "2026-01-20" },
      activities: [
        {
          activity_id: "senate:roll_call_vote:2026-01-19:402",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-19",
          title: "Final passage",
          bill: {
            congress: 119,
            type: "S.Con.Res.",
            number: "33",
            title: "Budget resolution",
            summary: "Sets aggregate spending and revenue levels and reconciliation instructions for committees.",
            policy_area: "Economics and Public Finance",
          },
          members: ["D1", "D2", "R1", "R2"],
        },
        {
          activity_id: "senate:roll_call_vote:2026-01-19:401",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-19",
          title: "Amendment",
          bill: {
            congress: 119,
            type: "S.Con.Res.",
            number: "33",
            title: "Budget resolution",
            summary: "Sets aggregate spending and revenue levels and reconciliation instructions for committees.",
            policy_area: "Economics and Public Finance",
          },
          members: ["D1", "D2", "R1", "R2"],
        },
      ],
    };

    const briefing = buildBriefingFeedResponse(amendLedger, overview, amendActivities);
    const finalItem = briefing.items.find((i) => i.vote_number === 402)!;
    const amendItem = briefing.items.find((i) => i.vote_number === 401)!;
    expect(finalItem.content_confidence).toBe("high");
    expect(amendItem.content_confidence).toBe("low");
    expect(briefing.items[0].vote_number).toBe(402);
    expect(amendItem.public_impact_summary.toLowerCase()).toContain("amendment");
  });

  it("orders same-day public-lands passage before same-day cloture by roll-call number", () => {
    const landsLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 2,
      entries: [
        {
          vote_number: 502,
          vote_date: "2026-01-20",
          title: "H.J.Res. 140 — Protecting National Parks",
          question: "On Passage of the Joint Resolution",
          result: "Agreed to",
          issue: "H.J.Res. 140",
          member_votes: { D1: "Yea", D2: "Yea", R1: "Nay", R2: "Nay" },
        },
        {
          vote_number: 501,
          vote_date: "2026-01-20",
          title: "Motion to Invoke Cloture on Aaron Christian Peterson, of Alaska, to be United States District Judge",
          question: "On Cloture",
          result: "Agreed to",
          issue: "PN999",
          member_votes: { D1: "Yea", D2: "Yea", R1: "Yea", R2: "Yea" },
        },
      ],
    };

    const landsActivities: ActivityIndexJson = {
      generated_at: "2026-01-20T12:00:00Z",
      window: { start_date: "2026-01-10", end_date: "2026-01-20" },
      activities: [
        {
          activity_id: "senate:roll_call_vote:2026-01-20:502",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-20",
          title: "H.J.Res. 140",
          bill: {
            congress: 119,
            type: "H.J.Res.",
            number: "140",
            title: "Protecting National Parks and Wilderness Areas",
            summary:
              "Withdraws certain federal lands from mineral leasing and expands national park protections for designated wilderness study areas.",
            policy_area: "Public Lands and Natural Resources",
          },
          members: ["D1", "D2", "R1", "R2"],
        },
        {
          activity_id: "senate:roll_call_vote:2026-01-20:501",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-20",
          title: "Cloture on district judge",
          members: ["D1", "D2", "R1", "R2"],
        },
      ],
    };

    const briefing = buildBriefingFeedResponse(landsLedger, overview, landsActivities);
    expect(briefing.items[0].vote_number).toBe(502);
    const detail = buildVoteDetailResponse(landsLedger, overview, landsActivities, 502);
    expect(detail?.vote_content_profile.policy_topics).toContain("public_lands");
  });

  it("tags foreign military sale discharge motions with foreign-policy topic cues", () => {
    const fmsLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 1,
      entries: [
        {
          vote_number: 601,
          vote_date: "2026-01-16",
          title: "Motion to Discharge S.J.Res. 12 — Foreign Military Sale to Partner Nation",
          question: "Motion to Discharge",
          result: "Agreed to",
          issue: "S.J.Res. 12",
          member_votes: { D1: "Yea", D2: "Nay", R1: "Yea", R2: "Yea" },
        },
      ],
    };

    const fmsActivities: ActivityIndexJson = {
      generated_at: "2026-01-20T12:00:00Z",
      window: { start_date: "2026-01-10", end_date: "2026-01-20" },
      activities: [
        {
          activity_id: "senate:roll_call_vote:2026-01-16:601",
          source: "senate",
          type: "roll_call_vote",
          date: "2026-01-16",
          title: "FMS discharge",
          bill: {
            congress: 119,
            type: "S.J.Res.",
            number: "12",
            title: "Disapproving a proposed foreign military sale",
            summary: "Disapproves a proposed sale of defense articles and services to a partner nation under the Arms Export Control Act.",
            policy_area: "International Affairs",
          },
          members: ["D1", "D2", "R1", "R2"],
        },
      ],
    };

    const detail = buildVoteDetailResponse(fmsLedger, overview, fmsActivities, 601);
    expect(detail?.vote_content_profile.policy_topics).toContain("foreign_policy");
  });

  it("includes every ledger vote in the briefing feed when under the item cap", () => {
    const senators = overview.senators;
    const entries: VoteLedger["entries"] = [];
    const activities: ActivityIndexJson["activities"] = [];

    for (let thread = 0; thread < 5; thread++) {
      const billNumber = String(910 + thread);
      const summary = `Thread ${thread} summary for diversity testing.`;
      for (let i = 0; i < 2; i++) {
        const voteNumber = 900 + thread * 2 + i;
        const cast: Record<string, string> = {};
        for (const s of senators) cast[s.bioguide_id] = "Yea";
        entries.push({
          vote_number: voteNumber,
          vote_date: `2026-01-${String(20 - thread).padStart(2, "0")}`,
          title: `S. ${billNumber} — vote ${voteNumber}`,
          question: i === 0 ? "On Passage of the Bill" : "On Cloture",
          result: "Agreed to",
          issue: `S. ${billNumber}`,
          member_votes: cast,
        });
        activities.push({
          activity_id: `senate:roll_call_vote:2026-01-${String(20 - thread).padStart(2, "0")}:${voteNumber}`,
          source: "senate",
          type: "roll_call_vote",
          date: `2026-01-${String(20 - thread).padStart(2, "0")}`,
          title: `Vote ${voteNumber}`,
          bill: {
            congress: 119,
            type: "S",
            number: billNumber,
            title: `Diversity bill ${billNumber}`,
            summary,
            policy_area: "Congress",
          },
          members: senators.map((s) => s.bioguide_id),
        });
      }
    }

    const divLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: entries.length,
      entries,
    };

    const divActivities: ActivityIndexJson = {
      generated_at: "2026-01-20T12:00:00Z",
      window: { start_date: "2026-01-10", end_date: "2026-01-20" },
      activities,
    };

    const briefing = buildBriefingFeedResponse(divLedger, overview, divActivities);
    expect(briefing.items).toHaveLength(entries.length);
    expect(briefing.items[0].vote_date >= briefing.items[briefing.items.length - 1].vote_date).toBe(true);
  });

  it("includes every vote on one measure thread when under the briefing item cap", () => {
    const senators = overview.senators;
    const entries: VoteLedger["entries"] = [];
    const activities: ActivityIndexJson["activities"] = [];
    const sharedBill = {
      congress: 119,
      type: "S",
      number: "777",
      title: "Single-thread bill",
      summary: "Repeated votes on the same measure for cap testing.",
      policy_area: "Congress",
    };
    for (let i = 0; i < 5; i++) {
      const voteNumber = 750 + i;
      const cast: Record<string, string> = {};
      for (const s of senators) cast[s.bioguide_id] = "Yea";
      entries.push({
        vote_number: voteNumber,
        vote_date: "2026-01-14",
        title: `S. 777 — vote ${voteNumber}`,
        question: i % 2 === 0 ? "On Passage of the Bill" : "On Cloture",
        result: "Agreed to",
        issue: "S. 777",
        member_votes: cast,
      });
      activities.push({
        activity_id: `senate:roll_call_vote:2026-01-14:${voteNumber}`,
        source: "senate",
        type: "roll_call_vote",
        date: "2026-01-14",
        title: `Vote ${voteNumber}`,
        bill: sharedBill,
        members: senators.map((s) => s.bioguide_id),
      });
    }

    const oneThreadLedger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: entries.length,
      entries,
    };

    const oneThreadActivities: ActivityIndexJson = {
      generated_at: "2026-01-20T12:00:00Z",
      window: { start_date: "2026-01-10", end_date: "2026-01-20" },
      activities,
    };

    const briefing = buildBriefingFeedResponse(oneThreadLedger, overview, oneThreadActivities);
    expect(briefing.items).toHaveLength(5);
  });

  it("materializes briefing rows for routine district court confirmations", () => {
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
    expect(briefing.items).toHaveLength(1);
    expect(briefing.items[0].category).toBe("Nomination");
  });
});
