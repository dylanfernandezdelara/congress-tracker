import { normalizeDigestBullets, normalizeDigestLead } from "../../../../shared/digest-format";
import type { BillDigestContent, BillDigestInsideRow } from "../../../../shared/digest-api-types";
import { stripMarkdownFence } from "../synthesis/llm-json";
import type { BillTextPart } from "./bill-text-parse";
import type { CheckableSummary } from "./checks";

/** Pull the JSON object out of a reply that may carry code fences or stray text around it. */
export function parseJsonObject(content: string | null | undefined): Record<string, unknown> | null {
  if (!content) return null;
  const text = stripMarkdownFence(content);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Share of the bill (0–100) taken by the parts a row cites ("Title VII" matches "Title VII — Finance / …"). */
function shareOf(section: string | null, parts: BillTextPart[], totalTokens: number): number | null {
  if (!section || !parts.length || totalTokens <= 0) return null;
  const prefix = section.split("/")[0]!.trim().toLowerCase();
  // "Title I" must not match "Title II": the prefix has to end at a word boundary.
  const matches = (label: string) => label.toLowerCase().startsWith(prefix) && !/[a-z0-9]/.test(label.charAt(prefix.length).toLowerCase());
  const tokens = parts.filter((p) => matches(p.label)).reduce((n, p) => n + p.tokens, 0);
  return tokens ? Math.min(100, Math.round((tokens / totalTokens) * 100)) : null;
}

export interface ParsedSummary {
  content: BillDigestContent;
  /** The same summary in the shape the checks read. */
  checkable: CheckableSummary;
}

/**
 * A model reply → the stored summary. The basis (text, CRS, title) is set from what the model was given, never
 * from its own claim; "What's inside" shares are measured from the bill's parts.
 */
export function parseSummaryReply(
  content: string | null | undefined,
  context: { basis: "text" | "crs" | "title_only"; parts: BillTextPart[]; totalTokens: number }
): ParsedSummary | null {
  const json = parseJsonObject(content);
  if (!json) return null;
  const headline = str(json.headline);
  const whatItDoes = str(json.what_it_does);
  if (!headline || !whatItDoes) return null;

  const rawPoints = Array.isArray(json.key_points) ? json.key_points : [];
  const points: Array<{ text: string; section: string | null }> = [];
  for (const p of rawPoints) {
    if (typeof p === "string" && p.trim()) points.push({ text: p.trim(), section: null });
    else if (p && typeof p === "object") {
      const text = str((p as Record<string, unknown>).text);
      if (text) points.push({ text, section: str((p as Record<string, unknown>).section) });
    }
  }
  const keyPoints = normalizeDigestBullets(points.map((p) => p.text));
  const sections = points.slice(0, keyPoints.length).map((p) => p.section);

  const who = (Array.isArray(json.who_it_affects) ? json.who_it_affects : [])
    .map(str)
    .filter((w): w is string => Boolean(w))
    .slice(0, 3);

  const inside: BillDigestInsideRow[] = (Array.isArray(json.inside) ? json.inside : [])
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const part = str(r.part);
      const summary = str(r.summary);
      if (!part || !summary) return null;
      const section = str(r.section);
      return { part, summary, section, share: shareOf(section, context.parts, context.totalTokens) };
    })
    .filter((r): r is BillDigestInsideRow => r !== null)
    .slice(0, 8);
  // Two rows citing the same part ("Taxes" and "Health care" both in Title VII) would each claim its whole share.
  const citedPart = (row: BillDigestInsideRow) => row.section?.split("/")[0]!.trim().toLowerCase() ?? "";
  for (const row of inside) {
    if (row.share !== null && inside.filter((other) => citedPart(other) === citedPart(row)).length > 1) row.share = null;
  }

  const stored: BillDigestContent = {
    headline,
    what_it_does: normalizeDigestLead(whatItDoes),
    key_points: keyPoints,
    terms_explained: [],
    key_point_sections: sections,
    who_it_affects: who,
    ...(inside.length ? { inside } : {}),
    basis: context.basis,
  };
  return {
    content: stored,
    checkable: {
      headline: stored.headline,
      what_it_does: stored.what_it_does,
      who_it_affects: who,
      key_points: keyPoints.map((text, i) => ({ text, section: sections[i] ?? null })),
      inside: inside.map(({ part, summary, section }) => ({ part, summary, section })),
    },
  };
}
