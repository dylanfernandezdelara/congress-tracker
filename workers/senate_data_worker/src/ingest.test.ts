import { afterEach, describe, it, expect, vi } from "vitest";
import { buildOutputVotes, buildVoteLedgerUpdate, extractIssue, parseIssueRef } from "./ingest";
import type { MemberIndexJson, VoteLedger } from "./types";
import type { VoteDetails, VoteSummary } from "./xml";

const membersIndex: MemberIndexJson = {
  congress: 119,
  generated_at: "2026-01-02T00:00:00.000Z",
  members: [
    { bioguide_id: "S270", name: "Schumer", party: "D", state: "NY", chamber: "Senate" },
    { bioguide_id: "G555", name: "Gillibrand", party: "D", state: "NY", chamber: "Senate" },
  ],
};

function voteMenuXml(voteNumbers: number[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <vote_summary>
      <congress>119</congress>
      <session>1</session>
      <votes>
        ${voteNumbers
          .map(
            (voteNumber) => `<vote>
              <vote_number>${voteNumber}</vote_number>
              <vote_date>2026-01-01</vote_date>
              <issue>S. ${voteNumber}</issue>
              <question>On Passage</question>
              <result>Agreed to</result>
              <vote_title>Vote ${voteNumber}</vote_title>
            </vote>`
          )
          .join("")}
      </votes>
    </vote_summary>`;
}

function voteDetailXml(voteNumber: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <roll_call_vote>
      <congress>119</congress>
      <session>1</session>
      <vote_number>${voteNumber}</vote_number>
      <vote_date>2026-01-01</vote_date>
      <vote_question_text>On Passage</vote_question_text>
      <vote_document_text>S. ${voteNumber}</vote_document_text>
      <vote_result_text>Agreed to</vote_result_text>
      <count>
        <yeas>2</yeas>
        <nays>0</nays>
        <present>0</present>
        <absent>0</absent>
      </count>
      <members>
        <member>
          <member_full>Schumer (D-NY)</member_full>
          <lis_member_id>S270</lis_member_id>
          <party>D</party>
          <state>NY</state>
          <vote_cast>Yea</vote_cast>
        </member>
        <member>
          <member_full>Gillibrand (D-NY)</member_full>
          <lis_member_id>G555</lis_member_id>
          <party>D</party>
          <state>NY</state>
          <vote_cast>Yea</vote_cast>
        </member>
      </members>
    </roll_call_vote>`;
}

function existingLedger(voteNumbers: number[]): VoteLedger {
  return {
    congress: 119,
    session: 1,
    generated_at: "2026-01-02T00:00:00.000Z",
    total_votes: voteNumbers.length,
    entries: voteNumbers.map((voteNumber) => ({
      vote_number: voteNumber,
      vote_date: "2026-01-01",
      title: `Vote ${voteNumber}`,
      question: "On Passage",
      result: "Agreed to",
      issue: `S. ${voteNumber}`,
      member_votes: {},
    })),
  };
}

function createIngestedDetailsDb(initialDetails: VoteDetails[] = []): D1Database & { storedDetails: Map<number, VoteDetails> } {
  const storedDetails = new Map(initialDetails.map((detail) => [detail.vote_number, detail] as const));
  const db = {
    storedDetails,
    async batch(statements: D1PreparedStatement[]) {
      await Promise.all(statements.map((statement) => statement.run()));
      return statements.map(() => ({ success: true, meta: { duration: 0 } }));
    },
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async run() {
          if (normalized.startsWith("INSERT OR REPLACE INTO ingested_vote_details")) {
            const detail = JSON.parse(String(bound[4])) as VoteDetails;
            storedDetails.set(detail.vote_number, detail);
          }
          return { success: true, meta: { duration: 0 } };
        },
        async all<T>() {
          if (normalized.includes("FROM ingested_vote_details")) {
            const rows = Array.from(storedDetails.values()).map((detail) =>
              normalized.includes("payload_json")
                ? { vote_number: detail.vote_number, payload_json: JSON.stringify(detail) }
                : { vote_number: detail.vote_number }
            );
            return { results: rows, success: true, meta: { duration: 0 } } as T;
          }
          if (normalized.includes("FROM votes")) {
            return { results: [], success: true, meta: { duration: 0 } } as T;
          }
          return { results: [], success: true, meta: { duration: 0 } } as T;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  };
  return db as unknown as D1Database & { storedDetails: Map<number, VoteDetails> };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildVoteLedgerUpdate", () => {
  it("does not fetch vote details already present in the existing ledger", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const requestUrl = String(url);
        requestedUrls.push(requestUrl);
        if (requestUrl.includes("vote_menu_119_1.xml")) {
          return new Response(voteMenuXml([1, 2]), {
            status: 200,
            headers: { "Content-Type": "application/xml" },
          });
        }
        return new Response("unexpected detail fetch", { status: 500 });
      })
    );

    const { ledger } = await buildVoteLedgerUpdate(
      { congress: 119, session: 1, targetState: "ALL", congressApiKey: "test" },
      membersIndex,
      existingLedger([1, 2]),
      { maxRetries: 0, timeoutMs: 1000, concurrency: 1 }
    );

    expect(ledger.total_votes).toBe(2);
    expect(requestedUrls.filter((url) => url.includes("roll_call_votes"))).toHaveLength(0);
  });

  it("stores newly fetched vote details in D1 and uses cached details on repeat", async () => {
    let detailFetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const requestUrl = String(url);
        if (requestUrl.includes("vote_menu_119_1.xml")) {
          return new Response(voteMenuXml([1]), {
            status: 200,
            headers: { "Content-Type": "application/xml" },
          });
        }
        if (requestUrl.includes("vote_119_1_00001.xml")) {
          detailFetchCount += 1;
          return new Response(voteDetailXml(1), {
            status: 200,
            headers: { "Content-Type": "application/xml" },
          });
        }
        return new Response("not found", { status: 404 });
      })
    );
    const db = createIngestedDetailsDb();

    const first = await buildVoteLedgerUpdate(
      { congress: 119, session: 1, targetState: "ALL", congressApiKey: "test" },
      membersIndex,
      null,
      { maxRetries: 0, timeoutMs: 1000, concurrency: 1 },
      { db }
    );
    const second = await buildVoteLedgerUpdate(
      { congress: 119, session: 1, targetState: "ALL", congressApiKey: "test" },
      membersIndex,
      null,
      { maxRetries: 0, timeoutMs: 1000, concurrency: 1 },
      { db }
    );

    expect(first.ledger.total_votes).toBe(1);
    expect(second.ledger.total_votes).toBe(1);
    expect(detailFetchCount).toBe(1);
    expect(db.storedDetails.size).toBe(1);
  });
});

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
