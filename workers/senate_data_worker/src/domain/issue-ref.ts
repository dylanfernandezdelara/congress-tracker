import type { BillRef } from "../types";
import type { VoteDetails } from "../xml";

export type IssueType = "bill" | "nomination" | "treaty" | "other";

/**
 * Extract issue/bill reference from vote details.
 *
 * Looks for patterns like "S. 1234", "H.R. 5678", "PN123" in title/question.
 */
export function extractIssue(detail: VoteDetails): string | undefined {
  const text = `${detail.vote_document ?? ""} ${detail.vote_title} ${detail.vote_question}`;

  const patterns = [
    /\b(S\.\s*\d+)\b/i,
    /\b(H\.R\.\s*\d+)\b/i,
    /\b(H\.\s*Res\.\s*\d+)\b/i,
    /\b(S\.\s*Res\.\s*\d+)\b/i,
    /\b(H\.\s*J\.\s*Res\.\s*\d+)\b/i,
    /\b(S\.\s*J\.\s*Res\.\s*\d+)\b/i,
    /\b(H\.\s*Con\.\s*Res\.\s*\d+)\b/i,
    /\b(S\.\s*Con\.\s*Res\.\s*\d+)\b/i,
    /\b(PN\s*\d+)\b/i,
    /\b(Treaty Doc\.\s*\d+-\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace(/\s+/g, " ");
    }
  }

  return undefined;
}

export function parseIssueRef(
  issue: string,
  congress: number
): {
  issue_type: IssueType;
  bill?: BillRef;
} {
  const trimmed = issue.trim();
  if (!trimmed) return { issue_type: "other" };

  const nominationMatch = trimmed.match(/PN\s*(\d+)/i);
  if (nominationMatch) {
    return { issue_type: "nomination" };
  }

  const treatyMatch = trimmed.match(/Treaty Doc\.\s*(\d+)-(\d+)/i);
  if (treatyMatch) {
    return { issue_type: "treaty" };
  }

  const billPatterns: Array<{ pattern: RegExp; type: string }> = [
    { pattern: /^H\.\s*Con\.\s*Res\./i, type: "H. Con. Res." },
    { pattern: /^S\.\s*Con\.\s*Res\./i, type: "S. Con. Res." },
    { pattern: /^H\.\s*J\.\s*Res\./i, type: "H. J. Res." },
    { pattern: /^S\.\s*J\.\s*Res\./i, type: "S. J. Res." },
    { pattern: /^H\.\s*Res\./i, type: "H. Res." },
    { pattern: /^S\.\s*Res\./i, type: "S. Res." },
    { pattern: /^H\.R\./i, type: "H.R." },
    { pattern: /^S\./i, type: "S." },
  ];

  for (const entry of billPatterns) {
    if (entry.pattern.test(trimmed)) {
      const numberMatch = trimmed.match(/(\d+)/);
      if (!numberMatch) break;
      const number = numberMatch[1];
      return {
        issue_type: "bill",
        bill: {
          congress,
          type: entry.type,
          number,
        },
      };
    }
  }

  return { issue_type: "other" };
}
