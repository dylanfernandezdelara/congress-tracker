import {
  normalizeDigestLead,
  trimDisplayTitle,
} from "../../../../shared/feed-content";
import { DIGEST_SOURCE_TITLE_FALLBACK } from "../../../../shared/digest-api-types";
import type { BillDigestContent } from "../types";

export interface TitleFallbackSource {
  title: string | null;
  policyArea: string | null;
  rawSummary: string | null;
}

function cleanTitle(title: string | null): string | null {
  const trimmed = title?.trim();
  if (!trimmed) return null;
  const display = trimDisplayTitle(trimmed).replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
  return display || null;
}

/**
 * Deterministic digest from bill metadata only. Used when the OpenRouter
 * rewrite returns nothing (or the run's rewrite budget is spent) so a
 * feed-visible bill never sits at `digest_json = NULL`. Never invents CRS
 * content: the lead is the CRS opening sentence when CRS exists, otherwise a
 * sentence that restates the title and says no official summary exists yet.
 * Returns null when there is neither a title nor CRS text to restate.
 */
export function buildTitleFallbackDigest(source: TitleFallbackSource): BillDigestContent | null {
  const title = cleanTitle(source.title);
  const crs = source.rawSummary?.trim() || null;
  if (!title && !crs) return null;

  const headline = title ?? normalizeDigestLead(crs ?? "");
  const whatItDoes = crs
    ? normalizeDigestLead(crs)
    : normalizeDigestLead(
        `This measure is titled "${title}" and does not yet have an official summary.`
      );
  const policyArea = source.policyArea?.trim();

  return {
    headline,
    what_it_does: whatItDoes,
    key_points: policyArea ? [`Policy area: ${policyArea}`] : [],
    terms_explained: [],
    source: DIGEST_SOURCE_TITLE_FALLBACK,
  };
}
