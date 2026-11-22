import {
  DIGEST_LEAD_MAX_WORDS,
  normalizeDigestLead,
  trimDisplayTitle,
  truncateWords,
} from "../../../../shared/feed-content";
import { DIGEST_SOURCE_TITLE_FALLBACK, type StoredBillDigest } from "../d1/digests";

export interface TitleFallbackSource {
  title: string | null;
  rawSummary: string | null;
}

function cleanTitle(title: string | null): string | null {
  const trimmed = title?.trim();
  if (!trimmed) return null;
  const display = trimDisplayTitle(trimmed).replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
  return display || null;
}

/**
 * CRS summaries open with the bill's short title on its own line ("Survivor
 * Justice Tax Prevention Act\nThis bill excludes..."). Collapsing whitespace
 * glues that line onto the first sentence, so drop it when it is the title.
 */
export function stripLeadingTitle(
  rawSummary: string | null,
  ...titles: Array<string | null>
): string | null {
  const crs = rawSummary?.trim();
  if (!crs) return null;
  const newline = crs.indexOf("\n");
  if (newline < 0) return crs;
  const firstLine = crs.slice(0, newline).trim().replace(/[.;,:]+$/, "").toLowerCase();
  const isTitle =
    !/[.!?]$/.test(crs.slice(0, newline).trim()) &&
    (titles.some((t) => t && t.trim().replace(/[.;,:]+$/, "").toLowerCase() === firstLine) ||
      // Short headings with no sentence punctuation ("Earth MRI Reauthorization Act of 2026").
      (firstLine.split(/\s+/).length <= 16 && /\bact\b|\bresolution\b/i.test(firstLine)));
  if (!isTitle) return crs;
  const rest = crs.slice(newline + 1).trim();
  return rest || crs;
}

/**
 * Deterministic digest from bill metadata only. Used when the OpenRouter
 * rewrite returns nothing (or the run's rewrite budget is spent) so a
 * feed-visible bill never sits at `digest_json = NULL`. Never invents CRS
 * content: the lead is the CRS opening sentence when CRS exists, otherwise a
 * sentence that restates the title and says no official summary exists yet.
 * Returns null when there is neither a title nor CRS text to restate.
 */
export function buildTitleFallbackDigest(source: TitleFallbackSource): StoredBillDigest | null {
  const title = cleanTitle(source.title);
  const crs = stripLeadingTitle(source.rawSummary, source.title, title);
  if (!title && !crs) return null;

  const headline = title ?? normalizeDigestLead(crs ?? "");
  // The templated lead is already one sentence; a first-sentence cut would
  // split on abbreviations inside the title ("St. Croix", "Jr.").
  const whatItDoes = crs
    ? normalizeDigestLead(crs)
    : truncateWords(
        `This measure is titled "${title}" and does not yet have an official summary.`,
        DIGEST_LEAD_MAX_WORDS
      );

  return {
    headline,
    what_it_does: whatItDoes,
    key_points: [],
    terms_explained: [],
    source: DIGEST_SOURCE_TITLE_FALLBACK,
  };
}
