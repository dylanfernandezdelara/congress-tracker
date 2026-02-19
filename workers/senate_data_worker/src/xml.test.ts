import { describe, it, expect } from "vitest";
import {
  parseVoteMenuXml,
  parseVoteDetailXml,
  filterVotesByDate,
  filterMembersByState,
  getUniqueDates,
  ensureArray,
  type VoteSummary,
  type MemberVote,
} from "./xml";

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("ensureArray", () => {
  const testCases: Array<{
    input: unknown;
    expected: unknown[];
    description: string;
  }> = [
    { input: undefined, expected: [], description: "undefined -> empty array" },
    { input: null, expected: [], description: "null -> empty array" },
    { input: [], expected: [], description: "empty array stays empty" },
    { input: [1, 2, 3], expected: [1, 2, 3], description: "array stays array" },
    { input: "single", expected: ["single"], description: "single string -> array" },
    { input: { a: 1 }, expected: [{ a: 1 }], description: "single object -> array" },
    { input: 42, expected: [42], description: "single number -> array" },
  ];

  it.each(testCases)("$description", ({ input, expected }) => {
    expect(ensureArray(input as never)).toEqual(expected);
  });
});

// ============================================================================
// Vote Menu Parsing Tests
// ============================================================================

describe("parseVoteMenuXml", () => {
  it("parses a standard vote menu with multiple votes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <congress>119</congress>
        <session>1</session>
        <congress_year>2025</congress_year>
        <votes>
          <vote>
            <vote_number>123</vote_number>
            <vote_date>December 18, 2025</vote_date>
            <issue>S. 1234</issue>
            <question>On the Motion</question>
            <result>Agreed to</result>
            <vote_title>A bill to do something important</vote_title>
          </vote>
          <vote>
            <vote_number>124</vote_number>
            <vote_date>December 18, 2025</vote_date>
            <issue>H.R. 5678</issue>
            <question>On Passage</question>
            <result>Rejected</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes).toHaveLength(2);
    expect(votes[0]).toEqual({
      vote_number: 123,
      vote_date: "2025-12-18",
      title: "A bill to do something important",
      result: "Agreed to",
    });
    expect(votes[1]).toEqual({
      vote_number: 124,
      vote_date: "2025-12-18",
      title: "On Passage - H.R. 5678",
      result: "Rejected",
    });
  });

  it("handles singleton vote (single vote element, not array)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <congress>119</congress>
        <session>1</session>
        <votes>
          <vote>
            <vote_number>1</vote_number>
            <vote_date>January 5, 2025</vote_date>
            <issue>S. 1</issue>
            <question>On the Motion</question>
            <result>Agreed to</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes).toHaveLength(1);
    expect(votes[0].vote_number).toBe(1);
  });

  it("handles short date format with congress_year", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <congress>119</congress>
        <session>1</session>
        <congress_year>2025</congress_year>
        <votes>
          <vote>
            <vote_number>123</vote_number>
            <vote_date>18-Dec</vote_date>
            <issue>S. 1234</issue>
            <question>On the Motion</question>
            <result>Agreed to</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes).toHaveLength(1);
    expect(votes[0].vote_date).toBe("2025-12-18");
  });

  it("uses title field fallback when vote_title is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <votes>
          <vote>
            <vote_number>1</vote_number>
            <vote_date>2025-12-18</vote_date>
            <title>Alternative Title Field</title>
            <result>Agreed to</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes[0].title).toBe("Alternative Title Field");
  });

  it("combines question and issue when no title present", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <votes>
          <vote>
            <vote_number>1</vote_number>
            <vote_date>2025-12-18</vote_date>
            <question>On the Nomination</question>
            <issue>PN123</issue>
            <result>Confirmed</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes[0].title).toBe("On the Nomination - PN123");
  });

  it("returns 'Unknown Vote' when no title info available", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <votes>
          <vote>
            <vote_number>1</vote_number>
            <vote_date>2025-12-18</vote_date>
            <result>Agreed to</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes[0].title).toBe("Unknown Vote");
  });

  it("truncates long titles at word boundary", () => {
    const longTitle =
      "A very long bill title that exceeds the maximum length limit and should be truncated at an appropriate word boundary to ensure readability";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <votes>
          <vote>
            <vote_number>1</vote_number>
            <vote_date>2025-12-18</vote_date>
            <vote_title>${longTitle}</vote_title>
            <result>Agreed to</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes[0].title.length).toBeLessThanOrEqual(100);
    expect(votes[0].title).toMatch(/\.\.\.$/);
  });

  it("handles empty votes section", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <congress>119</congress>
        <session>1</session>
        <votes></votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes).toEqual([]);
  });

  it("handles missing vote_summary", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <other_root>
        <something>else</something>
      </other_root>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes).toEqual([]);
  });

  it("returns empty array for malformed XML", () => {
    const votes = parseVoteMenuXml("<vote_summary><votes><vote></vote>");
    expect(votes).toEqual([]);
  });

  it("skips votes with missing vote_number", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <votes>
          <vote>
            <vote_date>2025-12-18</vote_date>
            <result>Agreed to</result>
          </vote>
          <vote>
            <vote_number>123</vote_number>
            <vote_date>2025-12-18</vote_date>
            <result>Agreed to</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes).toHaveLength(1);
    expect(votes[0].vote_number).toBe(123);
  });

  it("skips votes with invalid/missing date", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <vote_summary>
        <votes>
          <vote>
            <vote_number>1</vote_number>
            <vote_date>invalid-date</vote_date>
            <result>Agreed to</result>
          </vote>
          <vote>
            <vote_number>2</vote_number>
            <vote_date>2025-12-18</vote_date>
            <result>Agreed to</result>
          </vote>
        </votes>
      </vote_summary>`;

    const votes = parseVoteMenuXml(xml);

    expect(votes).toHaveLength(1);
    expect(votes[0].vote_number).toBe(2);
  });

  // Table-driven tests for various date formats in vote menu
  const dateFormatTests = [
    { format: "2025-12-18", description: "ISO format" },
    { format: "December 18, 2025", description: "Full month" },
    { format: "Dec 18, 2025", description: "Abbreviated month" },
    { format: "12/18/2025", description: "US format" },
  ];

  it.each(dateFormatTests)(
    "parses date in $description: $format",
    ({ format }) => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <vote_summary>
          <votes>
            <vote>
              <vote_number>1</vote_number>
              <vote_date>${format}</vote_date>
              <result>Agreed to</result>
            </vote>
          </votes>
        </vote_summary>`;

      const votes = parseVoteMenuXml(xml);

      expect(votes).toHaveLength(1);
      expect(votes[0].vote_date).toBe("2025-12-18");
    }
  );
});

// ============================================================================
// Vote Detail Parsing Tests
// ============================================================================

describe("parseVoteDetailXml", () => {
  const defaultCongress = 119;
  const defaultSession = 1;

  it("parses a complete vote detail XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <congress>119</congress>
        <session>1</session>
        <vote_number>123</vote_number>
        <vote_date>December 18, 2025</vote_date>
        <vote_question_text>On the Motion to Proceed</vote_question_text>
        <vote_document_text>S. 1234</vote_document_text>
        <vote_result_text>Agreed to</vote_result_text>
        <count>
          <yeas>60</yeas>
          <nays>38</nays>
          <present>1</present>
          <absent>1</absent>
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

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details).not.toBeNull();
    expect(details!.congress).toBe(119);
    expect(details!.session).toBe(1);
    expect(details!.vote_number).toBe(123);
    expect(details!.vote_date).toBe("2025-12-18");
    expect(details!.vote_question).toBe("On the Motion to Proceed");
    expect(details!.vote_result).toBe("Agreed to");
    expect(details!.counts).toEqual({
      yeas: 60,
      nays: 38,
      present: 1,
      not_voting: 1,
    });
    expect(details!.member_votes).toHaveLength(2);
    expect(details!.member_votes[0]).toEqual({
      member_full: "Schumer (D-NY)",
      lis_member_id: "S270",
      party: "D",
      state: "NY",
      vote_cast: "Yea",
    });
  });

  it("handles singleton member (single <member> element)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <vote_number>1</vote_number>
        <vote_date>2025-12-18</vote_date>
        <count>
          <yeas>1</yeas>
          <nays>0</nays>
        </count>
        <members>
          <member>
            <member_full>Solo (I-VT)</member_full>
            <party>I</party>
            <state>VT</state>
            <vote_cast>Yea</vote_cast>
          </member>
        </members>
      </roll_call_vote>`;

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details).not.toBeNull();
    expect(details!.member_votes).toHaveLength(1);
    expect(details!.member_votes[0].member_full).toBe("Solo (I-VT)");
  });

  // Field-name fallback tests for question field
  describe("question field fallbacks", () => {
    const questionFallbackTests = [
      {
        field: "vote_question_text",
        value: "Question from vote_question_text",
      },
      { field: "vote_question", value: "Question from vote_question" },
      { field: "question", value: "Question from question" },
    ];

    it.each(questionFallbackTests)(
      "uses $field when available",
      ({ field, value }) => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
          <roll_call_vote>
            <vote_number>1</vote_number>
            <vote_date>2025-12-18</vote_date>
            <${field}>${value}</${field}>
            <members></members>
          </roll_call_vote>`;

        const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

        expect(details!.vote_question).toBe(value);
      }
    );
  });

  // Field-name fallback tests for document/issue field
  describe("document field fallbacks", () => {
    const docFallbackTests = [
      { field: "vote_document_text", value: "S. 1234" },
      { field: "document_short_title", value: "S. 5678" },
      { field: "issue", value: "H.R. 9999" },
    ];

    it.each(docFallbackTests)(
      "uses $field when available",
      ({ field, value }) => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
          <roll_call_vote>
            <vote_number>1</vote_number>
            <vote_date>2025-12-18</vote_date>
            <${field}>${value}</${field}>
            <members></members>
          </roll_call_vote>`;

        const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

        // Document shows up in title when no explicit title
        expect(details!.vote_title).toContain(value);
      }
    );
  });

  // Field-name fallback tests for result field
  describe("result field fallbacks", () => {
    const resultFallbackTests = [
      { field: "vote_result_text", value: "Agreed to" },
      { field: "vote_result", value: "Rejected" },
      { field: "result", value: "Passed" },
    ];

    it.each(resultFallbackTests)(
      "uses $field when available",
      ({ field, value }) => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
          <roll_call_vote>
            <vote_number>1</vote_number>
            <vote_date>2025-12-18</vote_date>
            <${field}>${value}</${field}>
            <members></members>
          </roll_call_vote>`;

        const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

        expect(details!.vote_result).toBe(value);
      }
    );
  });

  // Count field variations
  describe("count field variations", () => {
    it("parses counts from 'count' element", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <count>
            <yeas>55</yeas>
            <nays>45</nays>
            <present>0</present>
            <absent>0</absent>
          </count>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.counts.yeas).toBe(55);
      expect(details!.counts.nays).toBe(45);
    });

    it("parses counts from 'counts' element (alternative)", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <counts>
            <yeas>55</yeas>
            <nays>45</nays>
            <present>0</present>
            <not_voting>0</not_voting>
          </counts>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.counts.yeas).toBe(55);
      expect(details!.counts.nays).toBe(45);
    });

    it("handles 'absent' as alias for 'not_voting'", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <count>
            <yeas>50</yeas>
            <nays>48</nays>
            <present>0</present>
            <absent>2</absent>
          </count>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.counts.not_voting).toBe(2);
    });

    it("handles 'not_voting' field directly", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <count>
            <yeas>50</yeas>
            <nays>48</nays>
            <present>0</present>
            <not_voting>2</not_voting>
          </count>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.counts.not_voting).toBe(2);
    });
  });

  it("uses defaults when congress/session missing from XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <vote_number>1</vote_number>
        <vote_date>2025-12-18</vote_date>
        <members></members>
      </roll_call_vote>`;

    const details = parseVoteDetailXml(xml, 118, 2);

    expect(details!.congress).toBe(118);
    expect(details!.session).toBe(2);
  });

  it("normalizes state codes to uppercase", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <vote_number>1</vote_number>
        <vote_date>2025-12-18</vote_date>
        <members>
          <member>
            <member_full>Test (D-ny)</member_full>
            <party>D</party>
            <state>ny</state>
            <vote_cast>Yea</vote_cast>
          </member>
        </members>
      </roll_call_vote>`;

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details!.member_votes[0].state).toBe("NY");
  });

  it("skips members without member_full", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <vote_number>1</vote_number>
        <vote_date>2025-12-18</vote_date>
        <members>
          <member>
            <party>D</party>
            <state>NY</state>
            <vote_cast>Yea</vote_cast>
          </member>
          <member>
            <member_full>Valid (R-TX)</member_full>
            <party>R</party>
            <state>TX</state>
            <vote_cast>Nay</vote_cast>
          </member>
        </members>
      </roll_call_vote>`;

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details!.member_votes).toHaveLength(1);
    expect(details!.member_votes[0].member_full).toBe("Valid (R-TX)");
  });

  it("returns null for missing roll_call_vote root", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <other_root>
        <something>else</something>
      </other_root>`;

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details).toBeNull();
  });

  it("returns null for malformed XML", () => {
    const details = parseVoteDetailXml(
      "<roll_call_vote><vote_number>1</vote_number>",
      defaultCongress,
      defaultSession
    );
    expect(details).toBeNull();
  });

  it("returns null for missing vote_number", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <vote_date>2025-12-18</vote_date>
        <members></members>
      </roll_call_vote>`;

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details).toBeNull();
  });

  it("returns null for invalid vote_date", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <vote_number>1</vote_number>
        <vote_date>invalid</vote_date>
        <members></members>
      </roll_call_vote>`;

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details).toBeNull();
  });

  it("handles lis_member_id being optional", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <roll_call_vote>
        <vote_number>1</vote_number>
        <vote_date>2025-12-18</vote_date>
        <members>
          <member>
            <member_full>Test (D-NY)</member_full>
            <party>D</party>
            <state>NY</state>
            <vote_cast>Yea</vote_cast>
          </member>
        </members>
      </roll_call_vote>`;

    const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

    expect(details!.member_votes[0].lis_member_id).toBeNull();
  });

  // Title building tests
  describe("vote title building", () => {
    it("uses vote_title when present", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <vote_title>Explicit Title</vote_title>
          <vote_question_text>Question</vote_question_text>
          <vote_document_text>Document</vote_document_text>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.vote_title).toBe("Explicit Title");
    });

    it("uses title field as fallback", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <title>Alternative Title</title>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.vote_title).toBe("Alternative Title");
    });

    it("combines question and document when no title", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <vote_question_text>On the Motion</vote_question_text>
          <vote_document_text>S. 1234</vote_document_text>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.vote_title).toBe("On the Motion: S. 1234");
    });

    it("uses only question when document missing", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <vote_question_text>On the Motion</vote_question_text>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.vote_title).toBe("On the Motion");
    });

    it("returns 'Unknown Vote' when no title info", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
          <vote_number>1</vote_number>
          <vote_date>2025-12-18</vote_date>
          <members></members>
        </roll_call_vote>`;

      const details = parseVoteDetailXml(xml, defaultCongress, defaultSession);

      expect(details!.vote_title).toBe("Unknown Vote");
    });
  });
});

// ============================================================================
// Filtering Utility Tests
// ============================================================================

describe("filterVotesByDate", () => {
  const votes: VoteSummary[] = [
    { vote_number: 1, vote_date: "2025-12-17", title: "Vote 1", result: null },
    { vote_number: 2, vote_date: "2025-12-18", title: "Vote 2", result: null },
    { vote_number: 3, vote_date: "2025-12-18", title: "Vote 3", result: null },
    { vote_number: 4, vote_date: "2025-12-19", title: "Vote 4", result: null },
  ];

  it("filters to matching date", () => {
    const result = filterVotesByDate(votes, "2025-12-18");

    expect(result).toHaveLength(2);
    expect(result[0].vote_number).toBe(2);
    expect(result[1].vote_number).toBe(3);
  });

  it("returns empty array when no matches", () => {
    const result = filterVotesByDate(votes, "2025-12-20");

    expect(result).toEqual([]);
  });

  it("handles empty input", () => {
    const result = filterVotesByDate([], "2025-12-18");

    expect(result).toEqual([]);
  });
});

describe("filterMembersByState", () => {
  const members: MemberVote[] = [
    {
      member_full: "Schumer (D-NY)",
      lis_member_id: "S270",
      party: "D",
      state: "NY",
      vote_cast: "Yea",
    },
    {
      member_full: "Cruz (R-TX)",
      lis_member_id: "C001098",
      party: "R",
      state: "TX",
      vote_cast: "Nay",
    },
    {
      member_full: "Gillibrand (D-NY)",
      lis_member_id: "G555",
      party: "D",
      state: "NY",
      vote_cast: "Yea",
    },
    {
      member_full: "Cornyn (R-TX)",
      lis_member_id: "C001056",
      party: "R",
      state: "TX",
      vote_cast: "Nay",
    },
  ];

  it("filters to matching state", () => {
    const result = filterMembersByState(members, "NY");

    expect(result).toHaveLength(2);
    expect(result[0].member_full).toBe("Schumer (D-NY)");
    expect(result[1].member_full).toBe("Gillibrand (D-NY)");
  });

  it("handles lowercase state input", () => {
    const result = filterMembersByState(members, "ny");

    expect(result).toHaveLength(2);
  });

  it("returns empty array when no matches", () => {
    const result = filterMembersByState(members, "CA");

    expect(result).toEqual([]);
  });

  it("handles empty input", () => {
    const result = filterMembersByState([], "NY");

    expect(result).toEqual([]);
  });
});

describe("getUniqueDates", () => {
  it("returns unique sorted dates", () => {
    const votes: VoteSummary[] = [
      { vote_number: 1, vote_date: "2025-12-18", title: "V1", result: null },
      { vote_number: 2, vote_date: "2025-12-17", title: "V2", result: null },
      { vote_number: 3, vote_date: "2025-12-18", title: "V3", result: null },
      { vote_number: 4, vote_date: "2025-12-19", title: "V4", result: null },
    ];

    const dates = getUniqueDates(votes);

    expect(dates).toEqual(["2025-12-17", "2025-12-18", "2025-12-19"]);
  });

  it("handles empty input", () => {
    const dates = getUniqueDates([]);

    expect(dates).toEqual([]);
  });

  it("handles single date", () => {
    const votes: VoteSummary[] = [
      { vote_number: 1, vote_date: "2025-12-18", title: "V1", result: null },
    ];

    const dates = getUniqueDates(votes);

    expect(dates).toEqual(["2025-12-18"]);
  });
});

