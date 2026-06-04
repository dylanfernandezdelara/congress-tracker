import { describe, expect, it } from "vitest";
import { extractIssue, parseIssueRef } from "./issue-ref";
import type { VoteDetails } from "../xml";

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
