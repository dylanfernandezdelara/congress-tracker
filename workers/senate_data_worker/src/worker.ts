/**
 * Congress Tracker worker — vote ingestion, digest rewrite, feed API.
 */

import type { Env } from "./config";
import { isPipelineBusyError, withPipelineLease } from "./d1/pipeline-lease";
import { recordFeedPipelineSkipped } from "./d1/pipeline-state";
import { purgePublicApiCache } from "./http/cache-purge";
import { handleFetch } from "./http/router";
import { runExecutivePostsPipeline } from "./pipeline/run-executive-posts";
import { runFeedWithMemberVotes } from "./pipeline/run-feed-with-member-votes";
import { EXECUTIVE_POSTS_CRON_UTC, FEED_PIPELINE_CRON_UTC } from "./constants";

export default {
  fetch(request: Request, env: Env, ctx?: ExecutionContext) {
    return handleFetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const cron = controller.cron ?? "";
    const isFeedCron = cron === FEED_PIPELINE_CRON_UTC;
    const isExecutiveCron = cron === EXECUTIVE_POSTS_CRON_UTC;

    if (isExecutiveCron) {
      ctx.waitUntil(
        withPipelineLease(env.DB, () =>
          runExecutivePostsPipeline(env, { trigger: "scheduled" })
        )
          .then(async (result) => {
            console.log(
              JSON.stringify({
                event: "executive_posts_pipeline_complete",
                cron: controller.cron,
                scheduledTime: controller.scheduledTime,
                ...result,
              }),
            );
            await purgePublicApiCache(env);
          })
          .catch((err: unknown) => {
            if (isPipelineBusyError(err)) {
              console.log(
                JSON.stringify({
                  event: "executive_posts_pipeline_skipped_busy",
                  cron: controller.cron,
                  scheduledTime: controller.scheduledTime,
                }),
              );
              return;
            }
            const message = err instanceof Error ? err.message : String(err);
            console.error(
              JSON.stringify({
                event: "executive_posts_pipeline_failed",
                cron: controller.cron,
                scheduledTime: controller.scheduledTime,
                error: message,
              }),
            );
          }),
      );
      return;
    }

    if (!isFeedCron) {
      console.warn(JSON.stringify({ event: "scheduled_unknown_cron", cron }));
      return;
    }

    ctx.waitUntil(
      withPipelineLease(env.DB, () =>
        runFeedWithMemberVotes(env, { trigger: "scheduled" })
      )
        .then(async (result) => {
          const { memberVotes: _memberVotes, memberVotesError: _memberVotesError, ...feed } =
            result;
          console.log(
            JSON.stringify({
              event: "feed_pipeline_complete",
              cron: controller.cron,
              scheduledTime: controller.scheduledTime,
              ...feed,
            }),
          );
          await purgePublicApiCache(env);
        })
        .catch(async (err: unknown) => {
          if (isPipelineBusyError(err)) {
            console.log(
              JSON.stringify({
                event: "feed_pipeline_skipped_busy",
                cron: controller.cron,
                scheduledTime: controller.scheduledTime,
              }),
            );
            try {
              await recordFeedPipelineSkipped(env.DB, "scheduled", "pipeline_busy");
            } catch (recordErr: unknown) {
              const recordMessage =
                recordErr instanceof Error ? recordErr.message : String(recordErr);
              console.error(
                JSON.stringify({
                  event: "feed_pipeline_skip_record_failed",
                  cron: controller.cron,
                  scheduledTime: controller.scheduledTime,
                  error: recordMessage,
                }),
              );
            }
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            JSON.stringify({
              event: "feed_pipeline_failed",
              cron: controller.cron,
              scheduledTime: controller.scheduledTime,
              error: message,
              stack: err instanceof Error ? err.stack : undefined,
            }),
          );
          throw err;
        }),
    );
  },
} satisfies ExportedHandler<Env>;
