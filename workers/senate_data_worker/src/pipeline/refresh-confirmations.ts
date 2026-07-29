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

  const refs = await selectNominationsNeedingEnrichment(
    env.DB,
    lookbackDate,
    CONFIRMATION_NOMINATION_FETCHES_PER_RUN
  );

  if (refs.length === 0) {
    return { nominationsFetched, backgroundsRewritten, skipped, warnings };
  }

  const model = await resolveOpenRouterModel(env);

  for (const ref of refs) {
    if (nominationsFetched >= CONFIRMATION_NOMINATION_FETCHES_PER_RUN) break;

    const existing = await getNomination(env.DB, ref);
    const hasBackground = parseStoredBackground(existing?.background_json ?? null) !== null;
    const hasRaw = Boolean(existing?.raw_background_text?.trim());

    let description = existing?.description ?? null;
    let organization = existing?.organization ?? null;
    let positionTitle = existing?.position_title ?? null;
    let nominees = parseNomineesJson(existing?.nominees_json ?? null);
    let receivedDate = existing?.received_date ?? null;
    let rawBackgroundText = existing?.raw_background_text ?? null;

    if (!hasRaw) {
      try {
        const bundle = await fetchNominationBundle(env, ref);
        nominationsFetched += 1;
        description = bundle.description;
        organization = bundle.organization;
        positionTitle = bundle.positionTitle;
        receivedDate = bundle.receivedDate;
        rawBackgroundText = bundle.rawBackgroundText;
        nominees = bundle.nominees;

        await upsertNominationMetadata(env.DB, {
          ref,
          description,
          organization,
          positionTitle,
          nominees,
          receivedDate,
          rawBackgroundText,
          background: null,
          preserveBackgroundJson: existing?.background_json ?? null,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Nomination ${nominationCitation(ref)} fetch failed: ${message}`);
        console.warn(
          JSON.stringify({
            event: "confirmation_nomination_fetch_failed",
            trigger,
            citation: nominationCitation(ref),
            error: message,
          })
        );
        skipped += 1;
        continue;
      }
    } else {
      nominationsFetched += 1;
    }

    if (hasBackground) {
      skipped += 1;
      continue;
    }

    if (backgroundsRewritten >= CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES) {
      skipped += 1;
      continue;
    }

    if (!rawBackgroundText?.trim()) {
      skipped += 1;
      continue;
    }

    const background = await rewriteConfirmationBackground(
      env,
      {
        citation: nominationCitation(ref),
        description,
        positionTitle,
        organization,
        rawBackground: rawBackgroundText,
      },
      model
    );

    await upsertNominationMetadata(env.DB, {
      ref,
      description,
      organization,
      positionTitle,
      nominees,
      receivedDate,
      rawBackgroundText,
      background,
      preserveBackgroundJson: background === null ? existing?.background_json ?? null : null,
    });

    if (background) {
      backgroundsRewritten += 1;
    } else {
      skipped += 1;
    }
  }

  return { nominationsFetched, backgroundsRewritten, skipped, warnings };
}
