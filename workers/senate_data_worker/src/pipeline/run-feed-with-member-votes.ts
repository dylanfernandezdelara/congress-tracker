import type { Env } from "../config";
import type { FeedPipelineTrigger } from "../../../../shared/ingest-api-types";
import { runFeedPipeline, type RunFeedResult } from "./run-feed";
import { runMemberVotesPipeline, type RunMemberVotesResult } from "./run-member-votes";

export interface RunFeedWithMemberVotesResult extends RunFeedResult {
  memberVotes?: RunMemberVotesResult;
  memberVotesError?: string;
}

/**
 * Daily ingest composition: feed first (records its own success/failure), then
 * best-effort per-member vote backfill. Keeps `runFeedPipeline` feed-only.
 */
export async function runFeedWithMemberVotes(
  env: Env,
  options: { trigger?: FeedPipelineTrigger } = {}
): Promise<RunFeedWithMemberVotesResult> {
  const trigger = options.trigger ?? "admin";
  const feedResult = await runFeedPipeline(env, { trigger });

  try {
    const memberVotes = await runMemberVotesPipeline(env);
    console.log(
      JSON.stringify({
        event: "member_votes_pipeline_complete",
        trigger,
        ...memberVotes,
      })
    );
    return { ...feedResult, memberVotes };
  } catch (err: unknown) {
    const memberVotesError = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "member_votes_pipeline_failed",
        trigger,
        error: memberVotesError,
      })
    );
    return { ...feedResult, memberVotesError };
  }
}
