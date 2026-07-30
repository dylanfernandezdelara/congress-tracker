import {
  CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES,
  CONFIRMATION_NOMINATION_FETCHES_PER_RUN,
  CONFIRMATION_WIKIPEDIA_FETCHES_PER_RUN,
} from "../constants";
import type { Env } from "../config";
import {
  getNomination,
  parseNomineesJson,
  parseStoredBackground,
  selectNominationsNeedingEnrichment,
  upsertNominationMetadata,
  upsertNominationStub,
  type ConfirmationBackgroundContent,
  type NominationRow,
} from "../d1/nominations";
import { upsertConfirmationVote } from "../d1/confirmation-votes";
import type { ConfirmationVote } from "../types";
import { fetchNominationBundle } from "../sources/nomination-client";
import { nominationCitation } from "../sources/nomination-ref";
import {
  lookupNomineeWikipedia,
  truncateWikipediaExtract,
} from "../sources/wikipedia";
import { resolveOpenRouterModel } from "../synthesis/model";
import { rewriteConfirmationBackground } from "../synthesis/confirmation-rewrite";

export interface RefreshConfirmationsResult {
  votesUpserted: number;
  nominationsFetched: number;
  backgroundsRewritten: number;
  wikipediaLookups: number;
  skipped: number;
  warnings: string[];
}

const WIKI_MISS_MARKER = "WikipediaLookup: none";
const WIKI_URL_PREFIX = "WikipediaLookup: ";

export async function persistConfirmationVotes(
  db: D1Database,
  votes: ConfirmationVote[]
): Promise<number> {
  for (const vote of votes) {
    await upsertConfirmationVote(db, vote);
    await upsertNominationStub(db, vote.nomination);
  }
  return votes.length;
}

/** True when raw text already records a Wikipedia attempt (hit or miss). */
export function rawMarksWikipediaAttempt(raw: string | null): boolean {
  if (!raw) return false;
  return raw.includes(`\n${WIKI_URL_PREFIX}`) || raw.startsWith(WIKI_URL_PREFIX);
}

/** Recover a sealed Wikipedia URL (or null miss) from raw prompt text. */
export function wikipediaUrlFromRaw(raw: string | null): string | null | undefined {
  if (!raw) return undefined;
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(WIKI_URL_PREFIX));
  if (!line) return undefined;
  const value = line.slice(WIKI_URL_PREFIX.length).trim();
  if (!value || value === "none") return null;
  if (value.startsWith("https://")) return value;
  return null;
}

function appendWikipediaToRaw(
  raw: string,
  hit: { url: string; extract: string } | null
): string {
  const base = raw.trim();
  if (hit) {
    const blurb = truncateWikipediaExtract(hit.extract);
    const biography = blurb ? `\nBiography: ${blurb}` : "";
    return `${base}\n${WIKI_URL_PREFIX}${hit.url}${biography}`;
  }
  return `${base}\n${WIKI_MISS_MARKER}`;
}

function wikipediaAttempted(background: ConfirmationBackgroundContent | null): boolean {
  return Boolean(background && "wikipedia_url" in background);
}

function applyWikipediaToBackground(
  background: ConfirmationBackgroundContent,
  hit: { url: string; extract: string } | null
): ConfirmationBackgroundContent {
  if (!hit) return { ...background, wikipedia_url: null };
  return {
    ...background,
    wikipedia_url: hit.url,
    background: truncateWikipediaExtract(hit.extract) || background.background,
  };
}

function nominationFieldsFromRow(row: NominationRow) {
  return {
    ref: {
      congress: row.congress,
      number: row.nomination_number,
      partNumber: row.part_number,
    },
    description: row.description,
    organization: row.organization,
    positionTitle: row.position_title,
    nominees: parseNomineesJson(row.nominees_json),
    receivedDate: row.received_date,
  };
}

/**
 * Fetch Congress.gov nomination metadata, Wikipedia person blurbs, and rewrite
 * plain-English backgrounds for recently confirmed nominations that still need
 * enrichment.
 */
export async function refreshConfirmationEnrichment(
  env: Env,
  lookbackDate: string,
  trigger: string
): Promise<Omit<RefreshConfirmationsResult, "votesUpserted">> {
  const warnings: string[] = [];
  let nominationsFetched = 0;
  let backgroundsRewritten = 0;
  let wikipediaLookups = 0;
  let skipped = 0;
  let model: string | null = null;

  const selectLimit = Math.max(
    CONFIRMATION_NOMINATION_FETCHES_PER_RUN,
    CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES,
    CONFIRMATION_WIKIPEDIA_FETCHES_PER_RUN
  );

  const candidates = await selectNominationsNeedingEnrichment(
    env.DB,
    lookbackDate,
    selectLimit
  );

  for (const candidate of candidates) {
    try {
      // 1) Ensure Congress.gov metadata when needed.
      if (
        candidate.needsRaw &&
        nominationsFetched < CONFIRMATION_NOMINATION_FETCHES_PER_RUN
      ) {
        const bundle = await fetchNominationBundle(env, candidate.ref);
        nominationsFetched += 1;
        const existing = await getNomination(env.DB, candidate.ref);
        await upsertNominationMetadata(env.DB, {
          ref: candidate.ref,
          description: bundle.description,
          organization: bundle.organization,
          positionTitle: bundle.positionTitle,
          nominees: bundle.nominees,
          receivedDate: bundle.receivedDate,
          // Empty string marks "fetched, no content" so we do not re-fetch forever.
          rawBackgroundText: bundle.rawBackgroundText ?? "",
          backgroundJson: existing?.background_json ?? null,
        });
      }

      // 2) Load once, enrich in memory, persist once.
      const row = await getNomination(env.DB, candidate.ref);
      if (!row) {
        skipped += 1;
        continue;
      }

      let background = parseStoredBackground(row.background_json);
      let rawBackground = row.raw_background_text;
      let dirty = false;
      /** Set only when a Wikipedia lookup actually ran this pass. */
      let wikiLookupResult: { url: string; extract: string } | null | undefined;

      const needsWikiLookup =
        wikipediaLookups < CONFIRMATION_WIKIPEDIA_FETCHES_PER_RUN &&
        !wikipediaAttempted(background) &&
        !rawMarksWikipediaAttempt(rawBackground);

      if (needsWikiLookup) {
        const nominees = parseNomineesJson(row.nominees_json);
        const primary = nominees[0];
        if (primary?.display_name) {
          const hit = await lookupNomineeWikipedia({
            displayName: primary.display_name,
            positionTitle: row.position_title,
            organization: row.organization,
          });
          wikipediaLookups += 1;
          wikiLookupResult = hit
            ? { url: hit.url, extract: hit.extract }
            : null;

          if (background) {
            background = applyWikipediaToBackground(background, hit);
            dirty = true;
          }
          if (rawBackground?.trim()) {
            // Append URL (+ extract) without rebuilding — keep Congress.gov intro text.
            rawBackground = appendWikipediaToRaw(rawBackground, hit);
            dirty = true;
          }
        } else {
          // No nominee name to look up — mark as attempted so we do not loop.
          wikiLookupResult = null;
          if (background) {
            background = { ...background, wikipedia_url: null };
            dirty = true;
          }
          if (rawBackground?.trim()) {
            rawBackground = appendWikipediaToRaw(rawBackground, null);
            dirty = true;
          }
        }
      }

      const canRewrite =
        backgroundsRewritten < CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES &&
        Boolean(rawBackground?.trim()) &&
        background === null;

      if (canRewrite) {
        if (model === null) {
          model = await resolveOpenRouterModel(env);
        }
        const rewritten = await rewriteConfirmationBackground(
          env,
          {
            citation: nominationCitation(candidate.ref),
            description: row.description,
            positionTitle: row.position_title,
            organization: row.organization,
            rawBackground: rawBackground!,
          },
          model
        );

        if (rewritten) {
          // Seal wikipedia_url from this-pass lookup or a durable raw marker.
          // Omit the key only when lookup was deferred (quota) with no prior marker.
          const sealedFromRaw = wikipediaUrlFromRaw(rawBackground);
          if (wikiLookupResult !== undefined) {
            background = {
              ...rewritten,
              wikipedia_url: wikiLookupResult?.url ?? null,
              background: wikiLookupResult?.extract
                ? truncateWikipediaExtract(wikiLookupResult.extract) ||
                  rewritten.background
                : rewritten.background,
            };
          } else if (sealedFromRaw !== undefined) {
            background = { ...rewritten, wikipedia_url: sealedFromRaw };
          } else {
            background = rewritten;
          }
          backgroundsRewritten += 1;
          dirty = true;
        } else {
          skipped += 1;
        }
      }

      if (dirty) {
        const fields = nominationFieldsFromRow(row);
        await upsertNominationMetadata(env.DB, {
          ...fields,
          rawBackgroundText: rawBackground,
          backgroundJson: background
            ? JSON.stringify(background)
            : row.background_json,
        });
      } else if (!candidate.needsRaw && !canRewrite && !needsWikiLookup) {
        skipped += 1;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(
        `Nomination ${nominationCitation(candidate.ref)} enrichment failed: ${message}`
      );
      console.warn(
        JSON.stringify({
          event: "confirmation_enrichment_failed",
          trigger,
          citation: nominationCitation(candidate.ref),
          error: message,
        })
      );
      skipped += 1;
    }
  }

  return {
    nominationsFetched,
    backgroundsRewritten,
    wikipediaLookups,
    skipped,
    warnings,
  };
}
