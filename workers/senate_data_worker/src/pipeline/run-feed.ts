import {
  DIGEST_MAX_NEW_REWRITES,
  FEED_MAX_BILLS,
  VOTE_LOOKBACK_DAYS,
} from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { getDigest, upsertDigest } from "../d1/digests";
import { recordFeedPipelineRun } from "../d1/pipeline-state";
import { selectExistingVoteKeys, upsertVote, selectRecentVotedBills } from "../d1/votes";
import { billLabel } from "./bill-label";
import { fetchBillSummaryBundle, lookbackStartIso } from "../sources/congress-client";
import { ingestHousePassageVotes } from "../sources/house-votes";
import { ingestSenatePassageVotes } from "../sources/senate-votes";
import { resolveOpenRouterModel } from "../synthesis/model";
import { rewriteSummary } from "../synthesis/openrouter";

export interface RunFeedResult {
  votesUpserted: number;
  votesSkipped: number;
  billsSelected: number;
  digestsWritten: number;
  digestsSkipped: number;
}

export async function runFeedPipeline(
  env: Env,
  options: { trigger?: "scheduled" | "admin" } = {}
): Promise<RunFeedResult> {
  const trigger = options.trigger ?? "admin";
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const congress = congressNumber(env);
  const knownVoteKeys = await selectExistingVoteKeys(env.DB, lookback, congress);

  const [houseResult, senateResult] = await Promise.all([
    ingestHousePassageVotes(env, lookback, knownVoteKeys),
    ingestSenatePassageVotes(env, lookback, knownVoteKeys),
  ]);

  const newVotes = [...houseResult.votes, ...senateResult.votes];
  for (const vote of newVotes) {
    await upsertVote(env.DB, vote);
  }

  const bills = await selectRecentVotedBills(env.DB, lookback, FEED_MAX_BILLS);
  const model = await resolveOpenRouterModel(env);

  let digestsWritten = 0;
  let digestsSkipped = 0;
  let newRewrites = 0;

  for (const row of bills) {
    const existing = await getDigest(
      env.DB,
      row.bill_congress,
      row.bill_type,
      row.bill_number
    );
    if (existing?.digest_json != null) {
      digestsSkipped += 1;
      continue;
    }

    if (newRewrites >= DIGEST_MAX_NEW_REWRITES) continue;

    const bundle = await fetchBillSummaryBundle(env, {
      congress: row.bill_congress,
      type: row.bill_type,
      number: row.bill_number,
    });

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

    await upsertDigest(env.DB, {
      congress: row.bill_congress,
      billType: row.bill_type,
      number: row.bill_number,
      title: bundle.title,
      policyArea: bundle.policyArea,
      rawSummaryText: bundle.rawSummaryText,
      digest,
    });

    digestsWritten += 1;
    newRewrites += 1;
  }

  const result: RunFeedResult = {
    votesUpserted: newVotes.length,
    votesSkipped: houseResult.skipped + senateResult.skipped,
    billsSelected: bills.length,
    digestsWritten,
    digestsSkipped,
  };

  await recordFeedPipelineRun(env.DB, trigger, result);

  return result;
}
