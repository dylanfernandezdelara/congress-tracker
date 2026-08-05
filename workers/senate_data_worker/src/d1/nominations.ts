import { isNominationDescriptionEcho } from "../../../../shared/confirmation-about";
import type { ConfirmationBackgroundContent } from "../../../../shared/confirmations-api-types";
import type { ConfirmationNominee } from "../../../../shared/confirmations-api-types";
import { isConfirmedResult } from "../sources/confirmation";
import {
  nominationCitation,
  type NominationRef,
} from "../sources/nomination-ref";
import { ensureSchema } from "./schema";

export type { ConfirmationBackgroundContent, ConfirmationNominee };

export interface NominationRow {
  congress: number;
  nomination_number: number;
  part_number: number;
  citation: string;
  description: string | null;
  organization: string | null;
  position_title: string | null;
  nominees_json: string | null;
  received_date: string | null;
  raw_background_text: string | null;
  background_json: string | null;
}

export function parseStoredBackground(
  json: string | null
): ConfirmationBackgroundContent | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ConfirmationBackgroundContent;
    if (!parsed.headline || !parsed.what_was_confirmed || !parsed.background) {
      return null;
    }
    const content: ConfirmationBackgroundContent = {
      headline: parsed.headline,
      what_was_confirmed: parsed.what_was_confirmed,
      background: parsed.background,
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
    };
    if ("wikipedia_url" in parsed) {
      content.wikipedia_url =
        typeof parsed.wikipedia_url === "string" && parsed.wikipedia_url.trim()
          ? parsed.wikipedia_url.trim()
          : null;
    }
    if ("wikipedia_extract" in parsed) {
      content.wikipedia_extract =
        typeof parsed.wikipedia_extract === "string" && parsed.wikipedia_extract.trim()
          ? parsed.wikipedia_extract.trim()
          : null;
    }
    if ("vote_context" in parsed) {
      content.vote_context =
        typeof parsed.vote_context === "string" && parsed.vote_context.trim()
          ? parsed.vote_context.trim()
          : null;
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * True when background JSON exists but Wikipedia enrichment has not been
 * attempted. A sealed miss (`wikipedia_url: null`) is terminal — reopen happens
 * only when rewrite drops those keys (e.g. after metadata repair clears an
 * echo About for a fresh rewrite).
 */
export function backgroundNeedsWikipedia(
  background: ConfirmationBackgroundContent | null
): boolean {
  if (!background) return false;
  if (background.wikipedia_extract?.trim()) return false;
  return !("wikipedia_url" in background);
}

/**
 * True when the grounded vote-context step should run: the background exists,
 * Wikipedia enrichment has been attempted (a hit gives us the grounding
 * article; a sealed miss seals vote_context as null too), and vote_context
 * has not been attempted yet.
 */
export function backgroundNeedsVoteContext(
  background: ConfirmationBackgroundContent | null
): boolean {
  if (!background) return false;
  if (!("wikipedia_url" in background)) return false;
  return !("vote_context" in background);
}

export function parseNomineesJson(json: string | null): ConfirmationNominee[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as ConfirmationNominee[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n) => n && typeof n.display_name === "string" && n.display_name.trim())
      .map((n) => ({
        display_name: n.display_name.trim(),
        state: typeof n.state === "string" && n.state.trim() ? n.state.trim() : null,
      }));
  } catch {
    return [];
  }
}

export async function getNomination(
  db: D1Database,
  ref: NominationRef
): Promise<NominationRow | null> {
  await ensureSchema(db);
  return db
    .prepare(
      `SELECT congress, nomination_number, part_number, citation, description,
              organization, position_title, nominees_json, received_date,
              raw_background_text, background_json
       FROM nominations
       WHERE congress = ? AND nomination_number = ? AND part_number = ?`
    )
    .bind(ref.congress, ref.number, ref.partNumber)
    .first<NominationRow>();
}

export async function upsertNominationStub(
  db: D1Database,
  ref: NominationRef
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const citation = nominationCitation(ref);
  await db
    .prepare(
      `INSERT INTO nominations (
         congress, nomination_number, part_number, citation,
         description, organization, position_title, nominees_json,
         received_date, raw_background_text, background_json,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(congress, nomination_number, part_number) DO NOTHING`
    )
    .bind(ref.congress, ref.number, ref.partNumber, citation, now, now)
    .run();
}

export async function upsertNominationMetadata(
  db: D1Database,
  params: {
    ref: NominationRef;
    description: string | null;
    organization: string | null;
    positionTitle: string | null;
    /**
     * `null` = never populated (keep incomplete-meta reopen open).
     * `[]` = fetched with no people (terminal).
     * non-empty = known nominees.
     */
    nominees: ConfirmationNominee[] | null;
    receivedDate: string | null;
    rawBackgroundText: string | null;
    /** Serialized background JSON to persist (null clears). */
    backgroundJson: string | null;
  }
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const citation = nominationCitation(params.ref);
  await db
    .prepare(
      `INSERT INTO nominations (
         congress, nomination_number, part_number, citation,
         description, organization, position_title, nominees_json,
         received_date, raw_background_text, background_json,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(congress, nomination_number, part_number) DO UPDATE SET
         citation = excluded.citation,
         description = excluded.description,
         organization = excluded.organization,
         position_title = excluded.position_title,
         nominees_json = excluded.nominees_json,
         received_date = excluded.received_date,
         raw_background_text = excluded.raw_background_text,
         background_json = excluded.background_json,
         updated_at = excluded.updated_at`
    )
    .bind(
      params.ref.congress,
      params.ref.number,
      params.ref.partNumber,
      citation,
      params.description,
      params.organization,
      params.positionTitle,
      params.nominees === null ? null : JSON.stringify(params.nominees),
      params.receivedDate,
      params.rawBackgroundText,
      params.backgroundJson,
      now,
      now
    )
    .run();
}

export interface NominationEnrichmentCandidate {
  ref: NominationRef;
  result: string;
  needsRaw: boolean;
  needsBackground: boolean;
  needsWikipedia: boolean;
  needsVoteContext: boolean;
}

/**
 * Confirmed nominations in the lookback window that still need Congress.gov
 * metadata, a plain-English background rewrite, Wikipedia enrichment, and/or
 * a grounded vote-context rewrite.
 */
export async function selectNominationsNeedingEnrichment(
  db: D1Database,
  lookbackDate: string,
  limit: number
): Promise<NominationEnrichmentCandidate[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT
         cv.nomination_congress AS congress,
         cv.nomination_number AS nomination_number,
         cv.part_number AS part_number,
         cv.result AS result,
         n.raw_background_text AS raw_background_text,
         n.background_json AS background_json,
         n.description AS description,
         n.nominees_json AS nominees_json
       FROM confirmation_votes cv
       LEFT JOIN nominations n
         ON n.congress = cv.nomination_congress
        AND n.nomination_number = cv.nomination_number
        AND n.part_number = cv.part_number
       WHERE cv.vote_date >= ?
       ORDER BY cv.vote_date DESC
       LIMIT ?`
    )
    .bind(lookbackDate, Math.max(limit * 3, limit))
    .all<{
      congress: number;
      nomination_number: number;
      part_number: number;
      result: string;
      raw_background_text: string | null;
      background_json: string | null;
      description: string | null;
      nominees_json: string | null;
    }>();

  const seen = new Set<string>();
  const candidates: NominationEnrichmentCandidate[] = [];
  for (const row of results ?? []) {
    if (!isConfirmedResult(row.result)) continue;
    const key = `${row.congress}:${row.nomination_number}:${row.part_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // null = never fetched; empty string = fetched but no usable text.
    // nominees_json null = never populated (re-fetch once for ordinal names).
    // nominees_json "[]" = fetched, no people — terminal, do not loop.
    const incompleteMeta =
      row.nominees_json === null && Boolean(row.description?.trim());
    const needsRaw = row.raw_background_text === null || incompleteMeta;
    const hasUsableRaw = Boolean(row.raw_background_text?.trim());
    const background = parseStoredBackground(row.background_json);
    const descriptionEcho =
      background !== null &&
      isNominationDescriptionEcho(background.background, row.description);
    // Rewrite missing About, or description-echo About that has not yet been
    // wiki-sealed. Sealed echoes are left alone (UI hides them); metadata
    // repair clears echo JSON so a fresh rewrite can run once.
    const needsBackground =
      hasUsableRaw &&
      !background?.wikipedia_extract?.trim() &&
      (background === null ||
        (descriptionEcho && !("wikipedia_url" in background)));
    const needsWikipedia = backgroundNeedsWikipedia(background);
    const needsVoteContext = backgroundNeedsVoteContext(background);
    if (!needsRaw && !needsBackground && !needsWikipedia && !needsVoteContext) {
      continue;
    }
    candidates.push({
      ref: {
        congress: row.congress,
        number: row.nomination_number,
        partNumber: row.part_number,
      },
      result: row.result,
      needsRaw,
      needsBackground,
      needsWikipedia,
      needsVoteContext,
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}
