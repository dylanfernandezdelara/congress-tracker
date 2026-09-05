import {
  EXECUTIVE_SIGNAL_LOOKBACK_DAYS,
  FEED_MAX_BILLS,
  INTRO_LOOKBACK_DAYS,
  PROCESS_MAX_HYDRATIONS_PER_RUN,
  VOTE_LOOKBACK_DAYS,
} from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import {
  recordFeedPipelineFailure,
  recordFeedPipelineSuccess,
} from "../d1/pipeline-state";
import type { FeedPipelineTrigger } from "../../../../shared/ingest-api-types";
import { inclusiveLookbackStartIso } from "../../../../shared/lookback";
import {
  selectExistingVoteKeys,
  upsertNonPassageVoteStub,
  upsertVote,
  selectFeedBills,
  selectRecentVotedBills,
} from "../d1/votes";
import { ensureMemberRoster } from "./ensure-member-roster";
import { fetchRecentPublicLaws, lookbackStartIso } from "../sources/congress-client";
import type { PublicLawRecord } from "../sources/public-laws";
import { ingestPassageVotesByChamber } from "./ingest-chambers";
import {
  persistConfirmationVotes,
  refreshConfirmationEnrichment,
} from "./refresh-confirmations";
import { persistPublicLaws } from "./refresh-public-laws";
import { persistRecentIntroductions } from "./refresh-introductions";
import { refreshFeedDigests } from "./refresh-feed-digests";
import { mergeLifecycleRefreshCandidates, refreshBillLifecycles } from "./refresh-lifecycles";
import { refreshBillTextChanges } from "./refresh-bill-text-changes";
import { enqueueProcessBills } from "../d1/bill-process";
import { hydrateProcessBills } from "./refresh-bill-process";
import { resolveOpenRouterModel } from "../synthesis/model";

export interface RunFeedResult {
  votesUpserted: number;
  votesSkipped: number;
  billsSelected: number;
  digestsWritten: number;
  digestsSkipped: number;
  digestsRewritten: number;
  digestWarnings: string[];
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
  confirmationVoteContextsWritten: number;
  confirmationWarnings: string[];
  introsDiscovered: number;
  introsPersisted: number;
  introWarnings: string[];
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

    const introResult = await persistRecentIntroductions(env, congress, trigger);
    if (introResult.warnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_partial_intro_discovery",
          trigger,
          discovered: introResult.discovered,
          persisted: introResult.persisted,
          warnings: introResult.warnings,
        })
      );
    }

    const votedBills = await selectRecentVotedBills(env.DB, lookback, FEED_MAX_BILLS);
    const feedWindowBills = await selectFeedBills(
      env.DB,
      lookback,
      lookbackStartIso(EXECUTIVE_SIGNAL_LOOKBACK_DAYS),
      inclusiveLookbackStartIso(INTRO_LOOKBACK_DAYS),
      FEED_MAX_BILLS
    );
    const bills = mergeLifecycleRefreshCandidates(
      votedBills,
      introResult.bills,
      feedWindowBills
    );
    const model = await resolveOpenRouterModel(env);
    let digestResult = {
      written: 0,
      skipped: 0,
      rewritten: 0,
      warnings: [] as string[],
    };
    try {
      digestResult = await refreshFeedDigests(env, bills, model, {
        prioritize: feedWindowBills,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      digestResult.warnings.push(`digest refresh failed: ${message}`);
    }
    const digestsWritten = digestResult.written;
    const digestsSkipped = digestResult.skipped;
    const digestsRewritten = digestResult.rewritten;
    const digestWarnings = digestResult.warnings;

    if (digestWarnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_partial_digest_refresh",
          trigger,
          warnings: digestWarnings,
        })
      );
    }

    let publicLaws: PublicLawRecord[] = [];
    const publicLawWarnings: string[] = [];
    try {
      publicLaws = await fetchRecentPublicLaws(env, congress);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      publicLawWarnings.push(message);
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_public_laws_list_failed",
          trigger,
          error: message,
        })
      );
    }

    const lifecycleResult = await refreshBillLifecycles(env, bills, trigger);
    const lifecycleRefreshed = lifecycleResult.refreshed;
    const lifecycleSkipped = lifecycleResult.skipped;
    const lifecycleWarnings = [...publicLawWarnings, ...lifecycleResult.warnings];

    try {
      const persisted = await persistPublicLaws(env, publicLaws, trigger);
      if (persisted.warnings.length > 0) {
        lifecycleWarnings.push(...persisted.warnings);
        console.warn(
          JSON.stringify({
            event: "feed_pipeline_partial_public_laws",
            trigger,
            listed: persisted.listed,
            upserted: persisted.upserted,
            titlesWritten: persisted.titlesWritten,
            warnings: persisted.warnings,
          })
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      lifecycleWarnings.push(message);
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_public_laws_persist_failed",
          trigger,
          error: message,
        })
      );
    }

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

    // Light committee-process refresh for feed bills (capped; full crawl is admin backfill).
    // Enqueue first so park/rehydrate timestamps stick; hydrate directly so a
    // discovery backlog cannot starve feed bills.
    try {
      const processCandidates = bills.slice(0, PROCESS_MAX_HYDRATIONS_PER_RUN).map((b) => ({
        congress: b.bill_congress,
        billType: b.bill_type,
        billNumber: b.bill_number,
      }));
      await enqueueProcessBills(env.DB, processCandidates);
      const processResult = await hydrateProcessBills(env, processCandidates);
      if (processResult.warnings.length > 0) {
        console.warn(
          JSON.stringify({
            event: "feed_pipeline_partial_process_refresh",
            trigger,
            warnings: processResult.warnings,
          })
        );
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "feed_pipeline_process_refresh_failed",
          trigger,
          error: err instanceof Error ? err.message : String(err),
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
      digestWarnings,
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
      confirmationVoteContextsWritten: confirmationEnrichment.voteContextsWritten,
      confirmationWarnings: confirmationEnrichment.warnings,
      introsDiscovered: introResult.discovered,
      introsPersisted: introResult.persisted,
      introWarnings: introResult.warnings,
    };

    try {
      await recordFeedPipelineSuccess(env.DB, trigger, {
        votesUpserted: result.votesUpserted,
        votesSkipped: result.votesSkipped,
        billsSelected: result.billsSelected,
        digestsWritten: result.digestsWritten,
        digestsSkipped: result.digestsSkipped,
        ...(digestWarnings.length > 0 ? { digest_warnings: digestWarnings } : {}),
        ...(chamberWarnings.length > 0 ? { chamber_warnings: chamberWarnings } : {}),
        ...(houseResult.sourceLatestDate
          ? { house_source_latest_date: houseResult.sourceLatestDate }
          : {}),
        ...(senateResult.sourceLatestDate
          ? { senate_source_latest_date: senateResult.sourceLatestDate }
          : {}),
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
        introsDiscovered: result.introsDiscovered,
        introsPersisted: result.introsPersisted,
        intro_warnings: introResult.warnings,
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
