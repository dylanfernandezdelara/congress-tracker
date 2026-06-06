/**
 * Senate Data Worker - single Cloudflare Worker for Senate vote ingestion + serving.
 *
 * Handles:
 * - Scheduled (cron) ingestion of Senate roll-call vote data
 * - Queue jobs (materialization, historical backfill)
 * - HTTP API for serving precomputed JSON from D1 plus pipeline admin routes
 */

import type { Env } from "./config";
import type { PipelineJob } from "./platform-types";
import { buildRuntime } from "./runtime";
import { handleFetch as handleFetchInner } from "./http/router";
import { handleScheduled as handleScheduledInner } from "./pipeline/scheduled-ingestion";
import { handleQueue as handleQueueInner } from "./pipeline/jobs";

export default {
  fetch(request: Request, env: Env, _ctx?: ExecutionContext) {
    return handleFetchInner(request, env);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    return handleScheduledInner(controller, env, ctx, buildRuntime(env));
  },
  queue(batch: MessageBatch<PipelineJob>, env: Env, ctx: ExecutionContext) {
    return handleQueueInner(batch, env, ctx, buildRuntime(env));
  },
} satisfies ExportedHandler<Env, PipelineJob>;
