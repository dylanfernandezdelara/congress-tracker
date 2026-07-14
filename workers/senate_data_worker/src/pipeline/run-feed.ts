import {
  DIGEST_MAX_NEW_REWRITES,
  FEED_MAX_BILLS,
  LIFECYCLE_MAX_REFRESHES_PER_RUN,
  VOTE_LOOKBACK_DAYS,
} from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { getDigest, upsertDigest, parseStoredDigest } from "../d1/digests";
import {
  getLifecyclesForBills,
  lifecycleMapKey,
  upsertLifecycle,
} from "../d1/lifecycle";
import {
  recordFeedPipelineFailure,
  recordFeedPipelineSuccess,
} from "../d1/pipeline-state";
import type { FeedPipelineTrigger } from "../../../../shared/ingest-api-types";
import { selectExistingVoteKeys, upsertVote, selectRecentVotedBills } from "../d1/votes";
import { billLabel } from "./bill-label";
import { ensureMemberRoster } from "./ensure-member-roster";
import { isTerminalLifecycle } from "../lifecycle/parse-actions";
import {
  fetchBillLifecycleSource,
  fetchBillSummaryBundle,
  lookbackStartIso,
} from "../sources/congress-client";
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
  lifecycleRefreshed: number;
  lifecycleSkipped: number;
  lifecycleWarnings: string[];
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

    let lifecycleRefreshed = 0;
    let lifecycleSkipped = 0;
    const lifecycleWarnings: string[] = [];

    const existingLifecycles = await getLifecyclesForBills(
      env.DB,
      bills.map((row) => ({
        congress: row.bill_congress,
        billType: row.bill_type,
        billNumber: row.bill_number,
      }))
    );

    for (const row of bills) {
      const key = lifecycleMapKey(row.bill_congress, row.bill_type, row.bill_number);
      const stored = existingLifecycles.get(key);
      if (
        stored &&
        isTerminalLifecycle({
          law_kind: stored.law_kind,
          signed_date: stored.signed_date,
          vetoed_date: stored.vetoed_date,
          became_law_date: stored.became_law_date,
        })
      ) {
        lifecycleSkipped += 1;
        continue;
      }

      if (lifecycleRefreshed >= LIFECYCLE_MAX_REFRESHES_PER_RUN) {
        lifecycleSkipped += 1;
        continue;
      }

      try {
        const source = await fetchBillLifecycleSource(env, {
          congress: row.bill_congress,
          type: row.bill_type,
          number: row.bill_number,
        });
        const m = source.milestones;
        await upsertLifecycle(env.DB, {
          congress: row.bill_congress,
          billType: row.bill_type,
          billNumber: row.bill_number,
          introducedDate: source.introducedDate,
          presentedDate: m.presented_date,
          signedDate: m.signed_date,
          vetoedDate: m.vetoed_date,
          becameLawDate: m.became_law_date,
          lawKind: m.law_kind,
          publicLaw: m.public_law,
          latestActionDate: m.latest_action_date,
          latestActionText: m.latest_action_text,
        });
        lifecycleRefreshed += 1;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const label = billLabel(row.bill_type, row.bill_number, row.bill_congress);
        lifecycleWarnings.push(`${label}: ${message}`);
        console.warn(
          JSON.stringify({
            event: "lifecycle_refresh_failed",
            trigger,
            bill: label,
            error: message,
          })
        );
      }
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
