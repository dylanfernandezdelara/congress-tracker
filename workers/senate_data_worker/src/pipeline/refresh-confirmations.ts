import {
  CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES,
  CONFIRMATION_NOMINATION_FETCHES_PER_RUN,
} from "../constants";
import type { Env } from "../config";
import {
  getNomination,
  parseNomineesJson,
  parseStoredBackground,
  selectNominationsNeedingEnrichment,
  upsertNominationMetadata,
  upsertNominationStub,
} from "../d1/nominations";
import { upsertConfirmationVote } from "../d1/confirmation-votes";
import type { ConfirmationVote } from "../types";
import { fetchNominationBundle } from "../sources/nomination-client";
import { nominationCitation } from "../sources/nomination-ref";
import { resolveOpenRouterModel } from "../synthesis/model";
import { rewriteConfirmationBackground } from "../synthesis/confirmation-rewrite";

export interface RefreshConfirmationsResult {
  votesUpserted: number;
  nominationsFetched: number;
  backgroundsRewritten: number;
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

/**
 * Fetch Congress.gov nomination metadata and rewrite plain-English backgrounds
 * for recently confirmed nominations that still need enrichment.
 */
export async function refreshConfirmationEnrichment(
  env: Env,
  lookbackDate: string,
  trigger: string
): Promise<Omit<RefreshConfirmationsResult, "votesUpserted">> {
  const warnings: string[] = [];
  let nominationsFetched = 0;
  let backgroundsRewritten = 0;
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

      if (backgroundsRewritten >= CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES) {
        continue;
      }

      const existing = await getNomination(env.DB, candidate.ref);
      if (!existing?.raw_background_text?.trim()) {
        skipped += 1;
        continue;
      }
      if (parseStoredBackground(existing.background_json) !== null) {
        continue;
      }

      if (model === null) {
        model = await resolveOpenRouterModel(env);
      }

      const background = await rewriteConfirmationBackground(
        env,
        {
          citation: nominationCitation(candidate.ref),
          description: existing.description,
          positionTitle: existing.position_title,
          organization: existing.organization,
          rawBackground: existing.raw_background_text,
        },
        model
      );

      await upsertNominationMetadata(env.DB, {
        ref: candidate.ref,
        description: existing.description,
        organization: existing.organization,
        positionTitle: existing.position_title,
        nominees: parseNomineesJson(existing.nominees_json),
        receivedDate: existing.received_date,
        rawBackgroundText: existing.raw_background_text,
        backgroundJson: background ? JSON.stringify(background) : existing.background_json,
      });

      if (background) {
        backgroundsRewritten += 1;
      } else {
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

  return { nominationsFetched, backgroundsRewritten, skipped, warnings };
}
