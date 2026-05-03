import { afterEach, describe, expect, it, vi } from "vitest";
import { extractVoteEvidence } from "./vote-evidence";
import type { VoteDetailResponse } from "./platform-types";
import type { MemberActivityContext, SessionOverview } from "./types";

function createBucket() {
  const objects = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => {
      const value = objects.get(key);
      if (value === undefined) return null;
      return {
        text: async () => value,
      };
    }),
    put: vi.fn(async (key: string, value: string) => {
      objects.set(key, value);
    }),
  } as unknown as R2Bucket;
}

const detail: VoteDetailResponse = {
  generated_at: "2026-03-08T12:00:00.000Z",
  source: "derived",
  vote_content_profile: {
    vote_id: "119:2:14",
    congress: 119,
    session: 2,
    vote_number: 14,
    vote_date: "2026-03-07",
    target_type: "bill",
    stage: "final_passage",
    plain_action: "The Senate passed S. 303.",
    official_summary: "Modernizes inspection and screening infrastructure at ports of entry.",
    public_impact_summary: "Modernizes inspection and screening infrastructure at ports of entry.",
    policy_topics: ["immigration"],
    affected_groups: [],
    content_confidence: "high",
    source_basis: ["official_bill_summary", "vote_question"],
  },
  vote: {
    id: "119:2:14",
    congress: 119,
    session: 2,
    vote_number: 14,
    vote_date: "2026-03-07",
    title: "Border Infrastructure Modernization Act",
    question: "On Passage of the Bill",
    result: "Passed",
    issue: "S. 303",
    tally: { yea: 52, nay: 48, present: 0, absent: 0 },
    status: "passed",
    bill: {
      congress: 119,
      type: "S",
      number: "303",
      title: "Border Infrastructure Modernization Act",
      summary: "Modernizes inspection and screening infrastructure at ports of entry.",
      policy_area: "Immigration",
    },
  },
  procedural_context: {
    step_type: "passage",
    question: "On Passage of the Bill",
  },
  party_breakdown: [
    { party: "R", yea: 48, nay: 2, present: 0, not_voting: 0, majority_vote: "yea" },
    { party: "D", yea: 4, nay: 46, present: 0, not_voting: 0, majority_vote: "nay" },
  ],
  crossovers: [],
  history: {
    thread_key: "119:S:303",
    measure_recurrence_count: 1,
    issue_key: "topic:border-infrastructure-modernization",
    issue_title: "Border Infrastructure Modernization Act",
    issue_recurrence_count: 1,
    first_seen_vote_date: "2026-03-07",
    related_votes: [],
  },
  arguments: {
    available: false,
    coverage_note: "No excerpts",
    parties: [],
    excerpts: [],
  },
  source_coverage: {
    level: "partial",
    vote_data: true,
    bill_context: true,
    congressional_record: false,
    floor_logs: false,
    model_summary: false,
  },
};

const overview: SessionOverview = {
  congress: 119,
  session: 2,
  generated_at: "2026-03-08T12:00:00.000Z",
  total_votes: 14,
  latest_vote_date: "2026-03-07",
  total_defections: 3,
  senators: [
    { bioguide_id: "R1", name: "Gamma, Riley", party: "R", state: "TX", votes_cast: 14, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
    { bioguide_id: "D1", name: "Alpha, Dana", party: "D", state: "NY", votes_cast: 14, votes_missed: 0, party_defections: 1, alignment_pct: 93 },
  ],
};

const context: MemberActivityContext = {
  floor_schedule: [],
  committee_meetings: [],
  daily_digest: [],
  senate_granule_highlights: [
    {
      source: "govinfo",
      package_id: "CREC-2026-03-07",
      granule_id: "G123",
      date: "2026-03-07",
      title: "Remarks on Border Infrastructure Modernization Act",
      member_bioguide_ids: ["R1"],
      text_url: "https://example.test/granule.txt",
    },
  ],
};

describe("extractVoteEvidence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds official excerpts and party summaries from linked record text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          "Senator Riley said the Border Infrastructure Modernization Act would strengthen border inspection capacity and modernize screening infrastructure for ports of entry.",
          {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          }
        )
      )
    );

    const evidence = await extractVoteEvidence(
      { DATA_BUCKET: createBucket() },
      detail,
      overview,
      context,
      { maxRetries: 0, timeoutMs: 2000 }
    );

    expect(evidence.documents).toHaveLength(1);
    expect(evidence.excerpts).toHaveLength(1);
    expect(evidence.excerpts[0].party).toBe("R");
    expect(evidence.excerpts[0].source_type).toBe("congress_record");
    expect(evidence.parties.find((party) => party.party === "R")?.excerpt_ids).toHaveLength(1);
    expect(evidence.parties.find((party) => party.party === "D")?.summary).toContain("Insufficient sourced evidence");
  });

  it("filters out obvious record noise even when the vote keywords are generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          "Congressional Record, Volume 172 Issue 41. PLEDGE OF ALLEGIANCE. I pledge allegiance to the Flag of the United States of America.",
          {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          }
        )
      )
    );

    const noisyContext: MemberActivityContext = {
      ...context,
      senate_granule_highlights: [
        {
          source: "govinfo",
          package_id: "CREC-2026-03-07",
          granule_id: "G999",
          date: "2026-03-07",
          title: "PLEDGE OF ALLEGIANCE",
          member_bioguide_ids: ["R1"],
          text_url: "https://example.test/noise.txt",
        },
      ],
    };

    const evidence = await extractVoteEvidence(
      { DATA_BUCKET: createBucket() },
      detail,
      overview,
      noisyContext,
      { maxRetries: 0, timeoutMs: 2000 }
    );

    expect(evidence.excerpts).toHaveLength(0);
    expect(evidence.documents).toHaveLength(0);
  });
});
