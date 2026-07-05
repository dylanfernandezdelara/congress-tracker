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
import type { DigestFailureReason } from "../../../../shared/digest-failure";
import { selectExistingVoteKeys, upsertVote, selectRecentVotedBills } from "../d1/votes";
import { billLabel } from "./bill-label";
import { logDigestFailure } from "./digest-failure";
import { ensureMemberRoster } from "./ensure-member-roster";
import { fetchBillSummaryBundle, lookbackStartIso } from "../sources/congress-client";
import { ingestPassageVotesByChamber } from "./ingest-chambers";
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
}

async function recordDigestFailure(
  env: Env,
  params: {
    trigger: FeedPipelineTrigger;
    billCongress: number;
    billType: string;
    billNumber: number;
    label: string;
    reason: DigestFailureReason;
    title: string | null;
    policyArea: string | null;
    rawSummaryText: string | null;
  }
): Promise<void> {
  logDigestFailure({ bill: params.label, reason: params.reason, trigger: params.trigger });
  await upsertDigest(env.DB, {
    congress: params.billCongress,
    billType: params.billType,
    number: params.billNumber,
    title: params.title,
    policyArea: params.policyArea,
    rawSummaryText: params.rawSummaryText,
    digest: null,
    digestFailureReason: params.reason,
  });
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
      const label = billLabel(row.bill_type, row.bill_number, row.bill_congress);
      const canRewrite = newRewrites < DIGEST_MAX_NEW_REWRITES;

      if (!canRewrite) {
        await recordDigestFailure(env, {
          trigger,
          billCongress: row.bill_congress,
          billType: row.bill_type,
          billNumber: row.bill_number,
          label,
          reason: "rewrite_budget_exhausted",
          title: bundle.title,
          policyArea: bundle.policyArea,
          rawSummaryText: bundle.rawSummaryText,
        });
        digestsWritten += 1;
        continue;
      }

      if (!bundle.rawSummaryText?.trim()) {
        await recordDigestFailure(env, {
          trigger,
          billCongress: row.bill_congress,
          billType: row.bill_type,
          billNumber: row.bill_number,
          label,
          reason: "no_crs_summary",
          title: bundle.title,
          policyArea: bundle.policyArea,
          rawSummaryText: bundle.rawSummaryText,
        });
        digestsWritten += 1;
        continue;
      }

      const digest = await rewriteSummary(
        env,
        {
          title: bundle.title,
          billLabel: label,
          policyArea: bundle.policyArea,
          rawSummary: bundle.rawSummaryText,
        },
        model
      );

      if (digest === null) {
        await recordDigestFailure(env, {
          trigger,
          billCongress: row.bill_congress,
          billType: row.bill_type,
          billNumber: row.bill_number,
          label,
          reason: "openrouter_rewrite_failed",
          title: bundle.title,
          policyArea: bundle.policyArea,
          rawSummaryText: bundle.rawSummaryText,
        });
        digestsWritten += 1;
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
        digestFailureReason: null,
      });
      digestsWritten += 1;
      digestsRewritten += 1;
      newRewrites += 1;
    }

    const result: RunFeedResult = {
      votesUpserted: newVotes.length,
      votesSkipped: houseResult.skipped + senateResult.skipped,
      billsSelected: bills.length,
      digestsWritten,
      digestsSkipped,
      digestsRewritten,
      chamberWarnings,
    };

    try {
      await recordFeedPipelineSuccess(env.DB, trigger, {
        votesUpserted: result.votesUpserted,
        votesSkipped: result.votesSkipped,
        billsSelected: result.billsSelected,
        digestsWritten: result.digestsWritten,
        digestsSkipped: result.digestsSkipped,
        ...(chamberWarnings.length > 0 ? { chamber_warnings: chamberWarnings } : {}),
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
