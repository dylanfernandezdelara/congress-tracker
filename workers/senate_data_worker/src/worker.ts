/**
 * Congress Tracker worker — vote ingestion, digest rewrite, feed API.
 */

import type { Env } from "./config";
import { handleFetch } from "./http/router";
import { runExecutivePostsPipeline } from "./pipeline/run-executive-posts";
import { runFeedPipeline } from "./pipeline/run-feed";
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
        runExecutivePostsPipeline(env, { trigger: "scheduled" })
          .then((result) => {
            console.log(
              JSON.stringify({
                event: "executive_posts_pipeline_complete",
                cron: controller.cron,
                scheduledTime: controller.scheduledTime,
                ...result,
              }),
            );
          })
          .catch((err: unknown) => {
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
      runFeedPipeline(env, { trigger: "scheduled" })
        .then((result) => {
          console.log(
            JSON.stringify({
              event: "feed_pipeline_complete",
              cron: controller.cron,
              scheduledTime: controller.scheduledTime,
              ...result,
            }),
          );
        })
        .catch((err: unknown) => {
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
