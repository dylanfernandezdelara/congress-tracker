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

function withWikipediaUrl(
  background: ConfirmationBackgroundContent,
  wikipediaUrl: string | null
): ConfirmationBackgroundContent {
  return { ...background, wikipedia_url: wikipediaUrl };
}

function preferPersonBlurb(
  current: string,
  wikipediaExtract: string
): string {
  const blurb = truncateWikipediaExtract(wikipediaExtract);
  if (!blurb) return current;
  const currentTrimmed = current.trim();
  // Replace thin "was nominated / confirmed as" restatements with the wiki blurb.
  const restatesConfirmation =
    /\b(was nominated|confirmed as|to lead|to be)\b/i.test(currentTrimmed) &&
    currentTrimmed.split(/\s+/).length <= 28;
  if (!currentTrimmed || restatesConfirmation || blurb.length > currentTrimmed.length + 20) {
    return blurb;
  }
  return currentTrimmed;
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

  const candidates = await selectNominationsNeedingEnrichment(
    env.DB,
    lookbackDate,
    CONFIRMATION_NOMINATION_FETCHES_PER_RUN
  );

  for (const candidate of candidates) {
    try {
      if (candidate.needsRaw && nominationsFetched < CONFIRMATION_NOMINATION_FETCHES_PER_RUN) {
        const bundle = await fetchNominationBundle(env, candidate.ref);
        nominationsFetched += 1;
        const existing = await getNomination(env.DB, candidate.ref);
        // Empty string marks "fetched, no content" so we do not re-fetch forever.
        await upsertNominationMetadata(env.DB, {
          ref: candidate.ref,
          description: bundle.description,
          organization: bundle.organization,
          positionTitle: bundle.positionTitle,
          nominees: bundle.nominees,
          receivedDate: bundle.receivedDate,
          rawBackgroundText: bundle.rawBackgroundText ?? "",
          backgroundJson: existing?.background_json ?? null,
        });
      }

      const existing = await getNomination(env.DB, candidate.ref);
      if (!existing) {
        skipped += 1;
        continue;
      }

      let background = parseStoredBackground(existing.background_json);
      let rawBackground = existing.raw_background_text;
      let wikipediaUrl: string | null | undefined =
        background && "wikipedia_url" in background ? background.wikipedia_url : undefined;

      // Wikipedia enrichment for new rewrites and for older rows that lack wikipedia_url.
      const needsWiki =
        wikipediaLookups < CONFIRMATION_WIKIPEDIA_FETCHES_PER_RUN &&
        (candidate.needsWikipedia ||
          (candidate.needsBackground && wikipediaUrl === undefined));

      if (needsWiki) {
        const nominees = parseNomineesJson(existing.nominees_json);
        const primary = nominees[0];
        if (primary?.display_name) {
          const hit = await lookupNomineeWikipedia({
            displayName: primary.display_name,
            positionTitle: existing.position_title,
            organization: existing.organization,
          });
          wikipediaLookups += 1;
          wikipediaUrl = hit?.url ?? null;
          if (hit?.extract) {
            // Fold bio into LLM source text when we still need a rewrite.
            if (!background && rawBackground?.trim()) {
              rawBackground = `${rawBackground.trim()}\nBiography: ${hit.extract}`;
            }
            if (background) {
              background = withWikipediaUrl(
                {
                  ...background,
                  background: preferPersonBlurb(background.background, hit.extract),
                },
                wikipediaUrl
              );
              await upsertNominationMetadata(env.DB, {
                ref: candidate.ref,
                description: existing.description,
                organization: existing.organization,
                positionTitle: existing.position_title,
                nominees,
                receivedDate: existing.received_date,
                rawBackgroundText: existing.raw_background_text,
                backgroundJson: JSON.stringify(background),
              });
            }
          } else if (background) {
            background = withWikipediaUrl(background, null);
            await upsertNominationMetadata(env.DB, {
              ref: candidate.ref,
              description: existing.description,
              organization: existing.organization,
              positionTitle: existing.position_title,
              nominees,
              receivedDate: existing.received_date,
              rawBackgroundText: existing.raw_background_text,
              backgroundJson: JSON.stringify(background),
            });
          }
        } else if (background) {
          background = withWikipediaUrl(background, null);
          await upsertNominationMetadata(env.DB, {
            ref: candidate.ref,
            description: existing.description,
            organization: existing.organization,
            positionTitle: existing.position_title,
            nominees: parseNomineesJson(existing.nominees_json),
            receivedDate: existing.received_date,
            rawBackgroundText: existing.raw_background_text,
            backgroundJson: JSON.stringify(background),
          });
        }
      }

      if (backgroundsRewritten >= CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES) {
        continue;
      }

      const refreshed = await getNomination(env.DB, candidate.ref);
      if (!refreshed?.raw_background_text?.trim() && !rawBackground?.trim()) {
        skipped += 1;
        continue;
      }
      if (parseStoredBackground(refreshed?.background_json ?? null) !== null) {
        continue;
      }

      if (model === null) {
        model = await resolveOpenRouterModel(env);
      }

      const rewritten = await rewriteConfirmationBackground(
        env,
        {
          citation: nominationCitation(candidate.ref),
          description: refreshed?.description ?? existing.description,
          positionTitle: refreshed?.position_title ?? existing.position_title,
          organization: refreshed?.organization ?? existing.organization,
          rawBackground: rawBackground?.trim() || refreshed!.raw_background_text!,
        },
        model
      );

      if (!rewritten) {
        skipped += 1;
        continue;
      }

      const stored = withWikipediaUrl(
        rewritten,
        wikipediaUrl === undefined ? null : wikipediaUrl
      );

      await upsertNominationMetadata(env.DB, {
        ref: candidate.ref,
        description: refreshed?.description ?? existing.description,
        organization: refreshed?.organization ?? existing.organization,
        positionTitle: refreshed?.position_title ?? existing.position_title,
        nominees: parseNomineesJson(
          refreshed?.nominees_json ?? existing.nominees_json
        ),
        receivedDate: refreshed?.received_date ?? existing.received_date,
        rawBackgroundText:
          refreshed?.raw_background_text ?? existing.raw_background_text,
        backgroundJson: JSON.stringify(stored),
      });
      backgroundsRewritten += 1;
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
