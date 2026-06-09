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
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runFeedPipeline(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
