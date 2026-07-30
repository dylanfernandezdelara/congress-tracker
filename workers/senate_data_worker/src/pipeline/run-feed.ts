import {
  DIGEST_MAX_NEW_REWRITES,
  FEED_MAX_BILLS,
  VOTE_LOOKBACK_DAYS,
} from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { getDigest, upsertDigest, parseStoredDigest } from "../d1/digests";
import {
  recordFeedPipelineFailure,
  recordFeedPipelineSuccess,
} from "../d1/pipeline-state";
import type { FeedPipelineTrigger } from "../../../../shared/ingest-api-types";
import {
  selectExistingVoteKeys,
  upsertNonPassageVoteStub,
  upsertVote,
  selectRecentVotedBills,
} from "../d1/votes";
import { billLabel } from "./bill-label";
import { ensureMemberRoster } from "./ensure-member-roster";
import { fetchBillSummaryBundle, lookbackStartIso } from "../sources/congress-client";
import { ingestPassageVotesByChamber } from "./ingest-chambers";
import {
  persistConfirmationVotes,
  refreshConfirmationEnrichment,
} from "./refresh-confirmations";
import { refreshBillLifecycles } from "./refresh-lifecycles";
import { refreshBillTextChanges } from "./refresh-bill-text-changes";
import { resolveOpenRouterModel } from "../synthesis/model";
import { rewriteSummary } from "../synthesis/openrouter";

export interface RunFeedResult {
  votesUpserted: number;
  votesSkipped: number;
  billsSelected: number;
  digestsWritten: number;
  digestsSkipped: number;
  digestsRewritten: number;
  chamberWarnings: string[];
  lifecycleRefreshed: number;
  lifecycleSkipped: number;
  lifecycleWarnings: string[];
  textChangesRefreshed: number;
  textChangesWithAddedProvisions: number;
  textChangesWarnings: string[];
  confirmationVotesUpserted: number;
  confirmationNominationsFetched: number;
  confirmationBackgroundsRewritten: number;
  confirmationWikipediaLookups: number;
  confirmationWarnings: string[];
}

export async function runFeedPipeline(
  env: Env,
  options: { trigger?: FeedPipelineTrigger } = {}
): Promise<RunFeedResult> {
  const trigger = options.trigger ?? "admin";

  try {
    try {
      await ensureMemberRoster(env);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: "member_roster_sync_failed",
          trigger,
          error: message,
        })
      );
    }

    const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
    const congress = congressNumber(env);
    const knownVoteKeys = await selectExistingVoteKeys(env.DB, lookback, congress);

    const { house: houseResult, senate: senateResult, chamberWarnings } =
      await ingestPassageVotesByChamber(env, lookback, knownVoteKeys);

    if (chamberWarnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_partial_chamber_ingest",
          trigger,
          warnings: chamberWarnings,
        })
      );
    }

    const newVotes = [...houseResult.votes, ...senateResult.votes];
    for (const vote of newVotes) {
      await upsertVote(env.DB, vote);
    }
    for (const stub of [
      ...(houseResult.nonPassageStubs ?? []),
      ...(senateResult.nonPassageStubs ?? []),
    ]) {
      await upsertNonPassageVoteStub(env.DB, stub);
    }

    const confirmationVotesUpserted = await persistConfirmationVotes(
      env.DB,
      senateResult.confirmationVotes
    );
    const confirmationEnrichment = await refreshConfirmationEnrichment(
      env,
      lookback,
      trigger
    );
    if (confirmationEnrichment.warnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_partial_confirmation_enrichment",
          trigger,
          warnings: confirmationEnrichment.warnings,
        })
      );
    }

    const bills = await selectRecentVotedBills(env.DB, lookback, FEED_MAX_BILLS);
    const model = await resolveOpenRouterModel(env);

    let digestsWritten = 0;
    let digestsSkipped = 0;
    let digestsRewritten = 0;
    let newRewrites = 0;

    for (const row of bills) {
      const existing = await getDigest(
        env.DB,
        row.bill_congress,
        row.bill_type,
        row.bill_number
      );
      if (parseStoredDigest(existing?.digest_json ?? null) !== null) {
        digestsSkipped += 1;
        continue;
      }

      const bundle = await fetchBillSummaryBundle(env, {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      });

      const metadataChanged =
        !existing?.raw_summary_text ||
        existing.title !== bundle.title ||
        existing.policy_area !== bundle.policyArea;

      const canRewrite = newRewrites < DIGEST_MAX_NEW_REWRITES;

      if (!canRewrite) {
        if (metadataChanged) {
          await upsertDigest(env.DB, {
            congress: row.bill_congress,
            billType: row.bill_type,
            number: row.bill_number,
            title: bundle.title,
            policyArea: bundle.policyArea,
            rawSummaryText: bundle.rawSummaryText,
            digest: null,
            preserveDigestJson: existing?.digest_json ?? null,
          });
          digestsWritten += 1;
        } else {
          digestsSkipped += 1;
        }
        continue;
      }

      let digest = null;
      if (bundle.rawSummaryText) {
        digest = await rewriteSummary(
          env,
          {
            title: bundle.title,
            billLabel: billLabel(row.bill_type, row.bill_number, row.bill_congress),
            policyArea: bundle.policyArea,
            rawSummary: bundle.rawSummaryText,
          },
          model
        );
      }

      if (digest === null && !metadataChanged) {
        digestsSkipped += 1;
        continue;
      }

      await upsertDigest(env.DB, {
        congress: row.bill_congress,
        billType: row.bill_type,
        number: row.bill_number,
        title: bundle.title,
        policyArea: bundle.policyArea,
        rawSummaryText: bundle.rawSummaryText,
        digest,
        preserveDigestJson: digest === null ? existing?.digest_json ?? null : null,
      });
      digestsWritten += 1;

      if (digest !== null) {
        digestsRewritten += 1;
        newRewrites += 1;
      }
    }

    const lifecycleResult = await refreshBillLifecycles(env, bills, trigger);
    const lifecycleRefreshed = lifecycleResult.refreshed;
    const lifecycleSkipped = lifecycleResult.skipped;
    const lifecycleWarnings = lifecycleResult.warnings;

    if (lifecycleWarnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_partial_lifecycle_refresh",
          trigger,
          warnings: lifecycleWarnings,
        })
      );
    }

    const textChanges = await refreshBillTextChanges(env, bills, trigger);
    if (textChanges.warnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_partial_text_changes_refresh",
          trigger,
          warnings: textChanges.warnings,
        })
      );
    }

    const result: RunFeedResult = {
      votesUpserted: newVotes.length,
      votesSkipped: houseResult.skipped + senateResult.skipped,
      billsSelected: bills.length,
      digestsWritten,
      digestsSkipped,
      digestsRewritten,
      chamberWarnings,
      lifecycleRefreshed,
      lifecycleSkipped,
      lifecycleWarnings,
      textChangesRefreshed: textChanges.refreshed,
      textChangesWithAddedProvisions: textChanges.withAddedProvisions,
      textChangesWarnings: textChanges.warnings,
      confirmationVotesUpserted,
      confirmationNominationsFetched: confirmationEnrichment.nominationsFetched,
      confirmationBackgroundsRewritten: confirmationEnrichment.backgroundsRewritten,
      confirmationWikipediaLookups: confirmationEnrichment.wikipediaLookups,
      confirmationWarnings: confirmationEnrichment.warnings,
    };

    try {
      await recordFeedPipelineSuccess(env.DB, trigger, {
        votesUpserted: result.votesUpserted,
        votesSkipped: result.votesSkipped,
        billsSelected: result.billsSelected,
        digestsWritten: result.digestsWritten,
        digestsSkipped: result.digestsSkipped,
        ...(chamberWarnings.length > 0 ? { chamber_warnings: chamberWarnings } : {}),
        lifecycleRefreshed: result.lifecycleRefreshed,
        lifecycleSkipped: result.lifecycleSkipped,
        ...(lifecycleWarnings.length > 0
          ? { lifecycle_warnings: lifecycleWarnings }
          : {}),
        textChangesRefreshed: result.textChangesRefreshed,
        textChangesWithAddedProvisions: result.textChangesWithAddedProvisions,
        ...(textChanges.warnings.length > 0
          ? { text_changes_warnings: textChanges.warnings }
          : {}),
        confirmationVotesUpserted: result.confirmationVotesUpserted,
        confirmationNominationsFetched: result.confirmationNominationsFetched,
        confirmationBackgroundsRewritten: result.confirmationBackgroundsRewritten,
        confirmationWikipediaLookups: result.confirmationWikipediaLookups,
        ...(confirmationEnrichment.warnings.length > 0
          ? { confirmation_warnings: confirmationEnrichment.warnings }
          : {}),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: "feed_pipeline_state_write_failed",
          trigger,
          error: message,
        })
      );
    }

    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await recordFeedPipelineFailure(env.DB, trigger, message);
    } catch (stateErr: unknown) {
      const stateMessage = stateErr instanceof Error ? stateErr.message : String(stateErr);
      console.error(
        JSON.stringify({
          event: "feed_pipeline_state_write_failed",
          trigger,
          error: stateMessage,
        })
      );
    }
    throw err;
  }
}
