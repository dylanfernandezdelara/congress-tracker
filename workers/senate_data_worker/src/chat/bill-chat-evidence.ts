import type { BillDigestContent } from "../../../../shared/digest-api-types";
import {
  cleanQuoteText,
  digestQuoteSourceText,
  normalizeForQuoteMatch,
} from "../../../../shared/quote-verification";
import type { Env } from "../config";
import { BILL_CHAT_EVIDENCE_MAX_CHARS } from "../constants";
import { getDigest, parseStoredDigest, type DigestRow } from "../d1/digests";
import { getBillText, type BillTextSectionRow } from "../d1/bill-text-sections";

export type EvidenceSource = "digest" | "crs" | "bill_text";

export type EvidenceChunk = {
  id: string;
  source: EvidenceSource;
  section_label: string;
  text: string;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "are",
  "was",
  "were",
  "been",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "shall",
  "may",
  "not",
  "but",
  "its",
  "his",
  "her",
  "they",
  "them",
  "their",
  "you",
  "your",
  "our",
  "out",
  "all",
  "any",
  "can",
  "into",
  "than",
  "then",
  "also",
  "such",
  "only",
  "over",
  "after",
  "before",
  "between",
  "under",
  "about",
  "which",
  "when",
  "what",
  "who",
  "how",
  "why",
  "does",
  "did",
  "being",
  "each",
  "other",
  "more",
  "most",
  "some",
  "these",
  "those",
]);

export function formatSectionLabel(label: string, heading: string): string {
  const raw = label.trim();
  const head = heading.trim();
  const enumPart = raw.replace(/\.$/, "");
  const looksLikeEnum = /^[0-9A-Za-z]+$/.test(enumPart);
  const title = looksLikeEnum ? `Sec. ${enumPart}` : enumPart || "Bill text";
  return head ? `${title}. ${head}` : title;
}

export function buildEvidenceChunks(params: {
  digest: BillDigestContent | null;
  crsSummary: string | null;
  sections: BillTextSectionRow[];
}): EvidenceChunk[] {
  const chunks: EvidenceChunk[] = [];
  const digestText = cleanQuoteText(digestQuoteSourceText(params.digest));
  if (digestText) {
    chunks.push({
      id: "digest",
      source: "digest",
      section_label: "Plain-English summary",
      text: digestText,
    });
  }
  const crsText = cleanQuoteText(params.crsSummary ?? "");
  if (crsText) {
    chunks.push({
      id: "crs",
      source: "crs",
      section_label: "CRS summary",
      text: crsText,
    });
  }
  const sections = [...params.sections].sort((a, b) => a.ordinal - b.ordinal);
  for (const section of sections) {
    const text = cleanQuoteText(section.body);
    if (!text) continue;
    chunks.push({
      id: `bill_text-${section.ordinal}`,
      source: "bill_text",
      section_label: formatSectionLabel(section.label, section.heading),
      text,
    });
  }
  return chunks;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function sectionOrdinal(chunk: EvidenceChunk): number {
  if (chunk.source !== "bill_text") return -1;
  const match = /^bill_text-(\d+)$/.exec(chunk.id);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function termFrequencies(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/**
 * Pick the evidence blocks that go into the system prompt: the digest and CRS
 * summary always, then bill-text sections ranked by a small tf/df score against
 * the question (and selected passage) until `maxChars` is spent. Sections are
 * tokenized once each; a bill can have hundreds on a public endpoint.
 */
export function selectEvidence(
  chunks: EvidenceChunk[],
  query: string,
  options: { maxChars: number } = { maxChars: BILL_CHAT_EVIDENCE_MAX_CHARS }
): EvidenceChunk[] {
  const always = chunks.filter((chunk) => chunk.source === "digest" || chunk.source === "crs");
  const sections = chunks.filter((chunk) => chunk.source === "bill_text");
  const queryTokens = [...new Set(tokens(query))];

  const bags = sections.map((chunk) => termFrequencies(`${chunk.section_label} ${chunk.text}`));
  const df = new Map<string, number>();
  for (const token of queryTokens) {
    df.set(token, bags.reduce((n, bag) => n + (bag.has(token) ? 1 : 0), 0));
  }

  const scored = sections.map((chunk, index) => {
    const bag = bags[index]!;
    let score = 0;
    for (const token of queryTokens) {
      const tf = bag.get(token) ?? 0;
      if (tf === 0) continue;
      score += tf / (1 + (df.get(token) ?? 0));
    }
    return { chunk, score, ordinal: sectionOrdinal(chunk) };
  });

  const anyMatch = scored.some((row) => row.score > 0);
  const ranked = anyMatch
    ? scored
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal)
        .map((row) => row.chunk)
    : [...sections].sort((a, b) => sectionOrdinal(a) - sectionOrdinal(b));

  const selected: EvidenceChunk[] = [...always];
  let used = always.reduce((n, chunk) => n + chunk.text.length, 0);
  for (const chunk of ranked) {
    if (used + chunk.text.length > options.maxChars) break;
    selected.push(chunk);
    used += chunk.text.length;
  }
  return selected;
}

export async function loadBillEvidence(
  env: Pick<Env, "DB">,
  bill: { congress: number; type: string; number: number }
): Promise<{ title: string; digestRow: DigestRow; chunks: EvidenceChunk[] } | null> {
  const digestRow = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  if (!digestRow) return null;
  const digest = parseStoredDigest(digestRow.digest_json);
  const stored = await getBillText(env.DB, bill);
  const chunks = buildEvidenceChunks({
    digest,
    crsSummary: digestRow.raw_summary_text,
    sections: stored?.sections ?? [],
  });
  return { title: digestRow.title?.trim() || "", digestRow, chunks };
}

function sliceDisplayQuote(chunkText: string, cleanedQuote: string): string | null {
  const idx = chunkText.toLowerCase().indexOf(cleanedQuote.toLowerCase());
  if (idx === -1) return null;
  return chunkText.slice(idx, idx + cleanedQuote.length);
}

/**
 * Locate the evidence chunk a quoted passage was copied from. The model's
 * `section` attribute is a hint, not a gate: the chunk with that label is tried
 * first so a passage that appears in several blocks (digest and bill text often
 * overlap) is attributed to the block the model cited, and the remaining chunks
 * are still searched when the label is missing or mistyped.
 */
export function findChunkForQuote(
  chunks: EvidenceChunk[],
  quoteText: string,
  section: string | null = null
): { chunk: EvidenceChunk; displayText: string } | null {
  const cleaned = cleanQuoteText(quoteText);
  const needle = normalizeForQuoteMatch(cleaned);
  if (!needle) return null;
  const hinted = section ? normalizeForQuoteMatch(section) : "";
  const ordered = hinted
    ? [
        ...chunks.filter((chunk) => normalizeForQuoteMatch(chunk.section_label) === hinted),
        ...chunks.filter((chunk) => normalizeForQuoteMatch(chunk.section_label) !== hinted),
      ]
    : chunks;
  for (const chunk of ordered) {
    if (!normalizeForQuoteMatch(chunk.text).includes(needle)) continue;
    return { chunk, displayText: sliceDisplayQuote(chunk.text, cleaned) ?? cleaned };
  }
  return null;
}
