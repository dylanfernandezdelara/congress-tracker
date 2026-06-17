/**
 * Congress Tracker worker — vote ingestion, digest rewrite, feed API.
 */

import type { Env } from "./config";
import { handleFetch } from "./http/router";
import { runFeedPipeline } from "./pipeline/run-feed";

export default {
  fetch(request: Request, env: Env, _ctx?: ExecutionContext) {
    return handleFetch(request, env);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runFeedPipeline(env)
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
