import type { ConfirmationBackgroundContent } from "../../../../shared/confirmations-api-types";
import type { ConfirmationNominee } from "../../../../shared/confirmations-api-types";
import { ensureSchema } from "./schema";
import {
  nominationCitation,
  type NominationRef,
} from "../sources/nomination-ref";

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
    return {
      headline: parsed.headline,
      what_was_confirmed: parsed.what_was_confirmed,
      background: parsed.background,
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
    };
  } catch {
    return null;
  }
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
    nominees: ConfirmationNominee[];
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
      params.nominees.length > 0 ? JSON.stringify(params.nominees) : null,
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
}

/**
 * Confirmed nominations in the lookback window that still need Congress.gov
 * metadata and/or a plain-English background rewrite.
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
         n.background_json AS background_json
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
    }>();

  const seen = new Set<string>();
  const candidates: NominationEnrichmentCandidate[] = [];
  for (const row of results ?? []) {
    const key = `${row.congress}:${row.nomination_number}:${row.part_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const needsRaw = !row.raw_background_text?.trim();
    const needsBackground = parseStoredBackground(row.background_json) === null;
    if (!needsRaw && !needsBackground) continue;
    candidates.push({
      ref: {
        congress: row.congress,
        number: row.nomination_number,
        partNumber: row.part_number,
      },
      result: row.result,
      needsRaw,
      needsBackground,
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}
