import { describe, it, expect } from "vitest";
import { buildOutputVotes, extractIssue, parseIssueRef } from "./ingest";
import type { VoteDetails, VoteSummary } from "./xml";

describe("extractIssue", () => {
  const makeVote = (title: string, question: string = ""): VoteDetails => ({
    congress: 119,
    session: 1,
    vote_number: 1,
    vote_date: "2025-12-18",
    vote_title: title,
    vote_question: question,
    vote_result: "Agreed to",
    counts: { yeas: 60, nays: 40, present: 0, not_voting: 0 },
    member_votes: [],
  });

  const testCases = [
    // Senate bills
    { title: "On Passage of S. 1234", expected: "S. 1234" },
    { title: "S. 5678 - Climate Act", expected: "S. 5678" },
    { title: "Motion to Table S.1", expected: "S.1" },

    // House bills
    { title: "On Passage of H.R. 1234", expected: "H.R. 1234" },
    { title: "H.R. 5678 Amendment", expected: "H.R. 5678" },

    // Resolutions
    { title: "On the Resolution H. Res. 123", expected: "H. Res. 123" },
    { title: "S. Res. 456 consideration", expected: "S. Res. 456" },
    { title: "H. J. Res. 78 motion", expected: "H. J. Res. 78" },
    { title: "S. J. Res. 90 cloture", expected: "S. J. Res. 90" },
    { title: "H. Con. Res. 12 passage", expected: "H. Con. Res. 12" },
    { title: "S. Con. Res. 34 vote", expected: "S. Con. Res. 34" },

    // Presidential nominations
    { title: "Nomination PN123", expected: "PN123" },
    { title: "On PN 456 confirmation", expected: "PN 456" },

    // Treaties
    { title: "Treaty Doc. 119-1 ratification", expected: "Treaty Doc. 119-1" },

    // No match
    { title: "Procedural Motion", expected: undefined },
    { title: "On the Amendment", expected: undefined },
    { title: "", expected: undefined },
  ];

  it.each(testCases)(
    'extracts issue from "$title" as $expected',
    ({ title, expected }) => {
      const vote = makeVote(title);
      const result = extractIssue(vote);
      expect(result).toBe(expected);
    }
  );

  it("extracts issue from question when not in title", () => {
    const vote = makeVote("Motion to Proceed", "On the Cloture Motion S. 9999");
    const result = extractIssue(vote);
    expect(result).toBe("S. 9999");
  });

  it("prefers first match when multiple bills mentioned", () => {
    const vote = makeVote("S. 111 amendment to H.R. 222");
    const result = extractIssue(vote);
    expect(result).toBe("S. 111");
  });
});

describe("buildOutputVotes", () => {
  const makeVoteDetail = (
    voteNumber: number,
    members: Array<{ name: string; state: string; party: string; vote: string }>
  ): VoteDetails => ({
    congress: 119,
    session: 1,
    vote_number: voteNumber,
    vote_date: "2025-12-18",
    vote_title: `Vote ${voteNumber} Title`,
    vote_question: "On the Motion",
    vote_result: "Agreed to",
    counts: { yeas: 60, nays: 40, present: 0, not_voting: 0 },
    member_votes: members.map((m) => ({
      member_full: m.name,
      lis_member_id: null,
      party: m.party,
      state: m.state,
      vote_cast: m.vote,
    })),
  });

  const makeSummary = (voteNumber: number): VoteSummary => ({
    vote_number: voteNumber,
    vote_date: "2025-12-18",
    title: `Summary ${voteNumber}`,
    result: "Summary Result",
  });

  it("filters members to target state", () => {
    const details = [
      makeVoteDetail(1, [
        { name: "Schumer (D-NY)", state: "NY", party: "D", vote: "Yea" },
        { name: "Cruz (R-TX)", state: "TX", party: "R", vote: "Nay" },
        { name: "Gillibrand (D-NY)", state: "NY", party: "D", vote: "Yea" },
      ]),
    ];
    const summaries = [makeSummary(1)];

    const { outputVotes, stateMemberVotes } = buildOutputVotes(
      details,
      summaries,
      "NY"
    );

    expect(outputVotes).toHaveLength(1);
    expect(outputVotes[0].members).toHaveLength(2);
    expect(outputVotes[0].members[0].name).toBe("Schumer (D-NY)");
    expect(outputVotes[0].members[1].name).toBe("Gillibrand (D-NY)");
    expect(stateMemberVotes).toBe(2);
  });

  it("excludes votes with no members from target state", () => {
    const details = [
      makeVoteDetail(1, [
        { name: "Cruz (R-TX)", state: "TX", party: "R", vote: "Nay" },
        { name: "Cornyn (R-TX)", state: "TX", party: "R", vote: "Nay" },
      ]),
      makeVoteDetail(2, [
        { name: "Schumer (D-NY)", state: "NY", party: "D", vote: "Yea" },
      ]),
    ];
    const summaries = [makeSummary(1), makeSummary(2)];

    const { outputVotes, stateMemberVotes } = buildOutputVotes(
      details,
      summaries,
      "NY"
    );

    expect(outputVotes).toHaveLength(1);
    expect(outputVotes[0].vote_number).toBe(2);
    expect(stateMemberVotes).toBe(1);
  });

  it("sorts output votes by vote number", () => {
    const details = [
      makeVoteDetail(3, [
        { name: "Sen3 (D-NY)", state: "NY", party: "D", vote: "Yea" },
      ]),
      makeVoteDetail(1, [
        { name: "Sen1 (D-NY)", state: "NY", party: "D", vote: "Yea" },
      ]),
      makeVoteDetail(2, [
        { name: "Sen2 (D-NY)", state: "NY", party: "D", vote: "Yea" },
      ]),
    ];
    const summaries = [makeSummary(3), makeSummary(1), makeSummary(2)];

    const { outputVotes } = buildOutputVotes(details, summaries, "NY");

    expect(outputVotes[0].vote_number).toBe(1);
    expect(outputVotes[1].vote_number).toBe(2);
    expect(outputVotes[2].vote_number).toBe(3);
  });

  it("converts not_voting to absent in output counts", () => {
    const details: VoteDetails[] = [
      {
        congress: 119,
        session: 1,
        vote_number: 1,
        vote_date: "2025-12-18",
        vote_title: "Test Vote",
        vote_question: "On the Motion",
        vote_result: "Agreed to",
        counts: { yeas: 55, nays: 43, present: 1, not_voting: 1 },
        member_votes: [
          {
            member_full: "Sen (D-NY)",
            lis_member_id: null,
            party: "D",
            state: "NY",
            vote_cast: "Yea",
          },
        ],
      },
    ];
    const summaries = [makeSummary(1)];

    const { outputVotes } = buildOutputVotes(details, summaries, "NY");

    expect(outputVotes[0].counts).toEqual({
      yeas: 55,
      nays: 43,
      present: 1,
      absent: 1,
    });
  });

  it("uses detail title over summary title", () => {
    const details: VoteDetails[] = [
      {
        congress: 119,
        session: 1,
        vote_number: 1,
        vote_date: "2025-12-18",
        vote_title: "Detail Title",
        vote_question: "On the Motion",
        vote_result: "Agreed to",
        counts: { yeas: 60, nays: 40, present: 0, not_voting: 0 },
        member_votes: [
          {
            member_full: "Sen (D-NY)",
            lis_member_id: null,
            party: "D",
            state: "NY",
            vote_cast: "Yea",
          },
        ],
      },
    ];
    const summaries: VoteSummary[] = [
      {
        vote_number: 1,
        vote_date: "2025-12-18",
        title: "Summary Title",
        result: "Summary Result",
      },
    ];

    const { outputVotes } = buildOutputVotes(details, summaries, "NY");

    expect(outputVotes[0].title).toBe("Detail Title");
  });

  it("falls back to summary title when detail title is empty", () => {
    const details: VoteDetails[] = [
      {
        congress: 119,
        session: 1,
        vote_number: 1,
        vote_date: "2025-12-18",
        vote_title: "",
        vote_question: "On the Motion",
        vote_result: "Agreed to",
        counts: { yeas: 60, nays: 40, present: 0, not_voting: 0 },
        member_votes: [
          {
            member_full: "Sen (D-NY)",
            lis_member_id: null,
            party: "D",
            state: "NY",
            vote_cast: "Yea",
          },
        ],
      },
    ];
    const summaries: VoteSummary[] = [
      {
        vote_number: 1,
        vote_date: "2025-12-18",
        title: "Summary Title",
        result: "Summary Result",
      },
    ];

    const { outputVotes } = buildOutputVotes(details, summaries, "NY");

    expect(outputVotes[0].title).toBe("Summary Title");
  });

  it("handles empty details array", () => {
    const { outputVotes, stateMemberVotes } = buildOutputVotes([], [], "NY");

    expect(outputVotes).toEqual([]);
    expect(stateMemberVotes).toBe(0);
  });

  it("case-insensitive state matching", () => {
    const details = [
      makeVoteDetail(1, [
        // Note: xml.ts normalizes state to uppercase during parsing
        // So in practice member.state will always be uppercase
        { name: "Sen (D-NY)", state: "NY", party: "D", vote: "Yea" },
      ]),
    ];
    const summaries = [makeSummary(1)];

    // filterMembersByState normalizes the input state to uppercase
    // so "ny" should match "NY"
    const { outputVotes } = buildOutputVotes(details, summaries, "ny");

    expect(outputVotes).toHaveLength(1);
  });
});

describe("parseIssueRef", () => {
  it("classifies bill issues", () => {
    const result = parseIssueRef("H.R. 1234", 119);
    expect(result.issue_type).toBe("bill");
    expect(result.bill?.type).toBe("H.R.");
    expect(result.bill?.number).toBe("1234");
  });

  it("classifies nominations", () => {
    const result = parseIssueRef("PN 42", 119);
    expect(result.issue_type).toBe("nomination");
    expect(result.bill).toBeUndefined();
  });

  it("classifies treaties", () => {
    const result = parseIssueRef("Treaty Doc. 119-1", 119);
    expect(result.issue_type).toBe("treaty");
    expect(result.bill).toBeUndefined();
  });
});
