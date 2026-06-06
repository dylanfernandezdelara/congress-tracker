import { afterEach, describe, it, expect, vi } from "vitest";
import { buildVoteLedgerUpdate } from "./ingest";
import type { MemberIndexJson, VoteLedger } from "./types";

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

  it("fetches vote details only once when no ledger exists", async () => {
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

    const first = await buildVoteLedgerUpdate(
      { congress: 119, session: 1, targetState: "ALL", congressApiKey: "test" },
      membersIndex,
      null,
      { maxRetries: 0, timeoutMs: 1000, concurrency: 1 }
    );
    const second = await buildVoteLedgerUpdate(
      { congress: 119, session: 1, targetState: "ALL", congressApiKey: "test" },
      membersIndex,
      first.ledger,
      { maxRetries: 0, timeoutMs: 1000, concurrency: 1 }
    );

    expect(first.ledger.total_votes).toBe(1);
    expect(second.ledger.total_votes).toBe(1);
    expect(detailFetchCount).toBe(1);
  });
});
