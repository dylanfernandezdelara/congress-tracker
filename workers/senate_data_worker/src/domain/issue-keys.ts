import type { BillRef, VoteLedgerEntry } from "../types";

const ISSUE_KEY_STOPWORDS = new Set([
  "about",
  "after",
  "against",
  "agreement",
  "agreed",
  "allowing",
  "amendment",
  "authorization",
  "authorizations",
  "bill",
  "committee",
  "congress",
  "confirmation",
  "confirmed",
  "consideration",
  "debate",
  "direct",
  "discharge",
  "floor",
  "forces",
  "hostilities",
  "measure",
  "motion",
  "nomination",
  "order",
  "passage",
  "point",
  "privilege",
  "proceed",
  "question",
  "recorded",
  "rejected",
  "resolution",
  "senate",
  "states",
  "table",
  "vote",
  "votes",
  "whether",
  "within",
]);

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function buildSlug(tokens: string[]): string {
  return tokens.join("-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeIssueText(value: string): string {
  return stripHtml(value)
    .toLowerCase()
    .replace(/\b(on|the|a|an)\b/g, " ")
    .replace(
      /\b(s\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|s\.?\s*res\.?|s\.?|h\.?\s*j\.?\s*res\.?|h\.?\s*con\.?\s*res\.?|h\.?\s*res\.?|h\.?\s*r\.?|pn)\s*\.?\s*\d+\b/gi,
      " "
    )
    .replace(/\b(motion to discharge|motion to proceed|motion to invoke cloture|motion to table|point of order|privilege status|cloture|confirmation)\b/g, " ")
    .replace(/\b(united states armed forces)\b/g, " armed forces ")
    .replace(/\b(hostilities within or against)\b/g, " hostilities against ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGenericIssueKey(text: string, fallback: string): string {
  const normalized = normalizeIssueText(text);
  if (!normalized) return fallback;

  if (/(war powers|armed forces|hostilities|authorized)/.test(normalized) && /iran|yemen|iraq|syria/.test(normalized)) {
    return "topic:war-powers";
  }

  if (/federal reserve|board of governors|jerome powell/.test(normalized)) {
    return "topic:federal-reserve-chair";
  }

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !ISSUE_KEY_STOPWORDS.has(token));
  if (tokens.length < 3) return fallback;

  return `topic:${buildSlug(tokens.slice(0, 6))}`;
}

export function extractNominationOffice(title: string): string | null {
  const cleaned = title.trim();
  const officeMatch = cleaned.match(/\bto be (.+)$/i);
  if (officeMatch?.[1]) return officeMatch[1].trim();
  return null;
}

export function buildThreadKey(entry: VoteLedgerEntry, bill: BillRef | undefined): string {
  if (bill?.congress && bill.type && bill.number) {
    return `${bill.congress}:${bill.type}:${bill.number}`;
  }
  if (entry.issue?.trim()) return entry.issue.trim().toUpperCase();
  return `vote:${entry.vote_number}`;
}

export function buildIssueKey(entry: VoteLedgerEntry, bill: BillRef | undefined): string {
  const threadKey = buildThreadKey(entry, bill);
  const nominationOffice = extractNominationOffice(entry.title);
  if (nominationOffice) {
    const slug = buildSlug(
      normalizeIssueText(nominationOffice)
        .split(/\s+/)
        .filter((token) => token.length >= 4)
        .slice(0, 6)
    );
    if (slug) return `nomination:${slug}`;
  }

  const preferredText = [bill?.title, bill?.summary, entry.title, entry.question, entry.issue]
    .filter(Boolean)
    .join(" ");
  return buildGenericIssueKey(preferredText, threadKey);
}
