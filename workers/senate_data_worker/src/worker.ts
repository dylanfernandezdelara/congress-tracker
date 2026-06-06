/**
 * Senate Data Worker — minimal shell pending full redesign.
 *
 * Serves a health check and placeholder responses for API routes that will be
 * reimplemented with the new storage and ingestion design.
 */

import type { Env } from "./config";
import { handleFetch } from "./http/router";

export default {
  fetch(request: Request, env: Env, _ctx?: ExecutionContext) {
    return handleFetch(request, env);
  },
  scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.resolve());
  },
} satisfies ExportedHandler<Env>;
