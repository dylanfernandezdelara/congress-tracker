import { isNominationDescriptionEcho } from "../../../../shared/confirmation-about";
import {
  CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES,
  CONFIRMATION_NOMINATION_FETCHES_PER_RUN,
  CONFIRMATION_WIKIPEDIA_FETCHES_PER_RUN,
} from "../constants";
import type { Env } from "../config";
import {
  backgroundNeedsWikipedia,
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
import {
  fetchNominationBundle,
  parseNominationDescription,
} from "../sources/nomination-client";
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

/** Attach Wikipedia as secondary enrichment — never overwrite official About text. */
function applyWikipediaToBackground(
  background: ConfirmationBackgroundContent,
  hit: { url: string; extract: string } | null
): ConfirmationBackgroundContent {
  if (!hit) {
    return { ...background, wikipedia_url: null, wikipedia_extract: null };
  }
  return {
    ...background,
    wikipedia_url: hit.url,
    wikipedia_extract: truncateWikipediaExtract(hit.extract) || null,
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
 * Official-first confirmation enrichment:
 * 1) Congress.gov metadata
 * 2) Official About rewrite from Congress.gov source text
 * 3) Wikipedia URL/extract attached only after an official About exists
 *
 * Wikipedia is never written into raw_background_text (keeps the LLM source
 * channel official-only).
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

      // 2) Load once → official rewrite → Wikipedia enrichment → persist once.
      const row = await getNomination(env.DB, candidate.ref);
      if (!row) {
        skipped += 1;
        continue;
      }

      let background = parseStoredBackground(row.background_json);
      const rawBackground = row.raw_background_text;
      let dirty = false;
      const priorWikiUrl = background?.wikipedia_url;
      const priorWikiExtract = background?.wikipedia_extract;
      const descriptionEcho =
        background !== null &&
        isNominationDescriptionEcho(background.background, row.description);

      const canRewrite =
        backgroundsRewritten < CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES &&
        Boolean(rawBackground?.trim()) &&
        !priorWikiExtract?.trim() &&
        (background === null || descriptionEcho);

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
          // Keep a prior wiki hit if present. Drop a sealed miss (null) so the
          // same-pass wiki step can reopen now that names may exist.
          background = { ...rewritten };
          if (priorWikiExtract?.trim()) {
            background.wikipedia_url = priorWikiUrl ?? null;
            background.wikipedia_extract = priorWikiExtract;
          }
          backgroundsRewritten += 1;
          dirty = true;
        } else if (background === null) {
          skipped += 1;
        }
      }

      // 3) Wikipedia only after an official About exists, and only when we have
      // a nominee name. Never seal a miss when names are still missing.
      const needsWikiLookup =
        wikipediaLookups < CONFIRMATION_WIKIPEDIA_FETCHES_PER_RUN &&
        backgroundNeedsWikipedia(background, row.description);

      if (needsWikiLookup && background) {
        const nominees = parseNomineesJson(row.nominees_json);
        const fromDescription =
          nominees.length === 0
            ? parseNominationDescription(row.description)
            : null;
        const primary =
          nominees[0] ?? fromDescription?.nominees[0] ?? null;
        const positionTitle =
          row.position_title?.trim() || fromDescription?.positionTitle || null;
        if (primary?.display_name) {
          const lookup = await lookupNomineeWikipedia({
            displayName: primary.display_name,
            positionTitle,
            organization: row.organization,
          });
          wikipediaLookups += 1;

          if (lookup.status === "unavailable") {
            warnings.push(
              `Nomination ${nominationCitation(candidate.ref)} Wikipedia lookup unavailable: ${lookup.error}`
            );
          } else {
            const hit =
              lookup.status === "hit"
                ? { url: lookup.hit.url, extract: lookup.hit.extract }
                : null;
            background = applyWikipediaToBackground(background, hit);
            dirty = true;
          }
        }
        // No nominee name yet — leave wikipedia_* unset so a later pass can try.
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
