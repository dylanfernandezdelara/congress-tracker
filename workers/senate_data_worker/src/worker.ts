/**
 * Senate Data Worker - single Cloudflare Worker for Senate vote ingestion + serving.
 *
 * Handles:
 * - Scheduled (cron) ingestion of Senate roll-call vote data
 * - Queue jobs (materialization, historical backfill)
 * - HTTP API for serving precomputed JSON from D1 plus pipeline admin routes
 */

import { applyHarnessEnv } from "./harness";
import type { PipelineEnv } from "./pipeline-env";
import type { PipelineJob } from "./platform-types";
import { handleFetch as handleFetchInner } from "./http/router";
import { handleScheduled as handleScheduledInner } from "./scheduled-ingestion";
import { handleQueue as handleQueueInner } from "./pipeline-jobs";

export default {
  fetch(request: Request, env: PipelineEnv, _ctx?: ExecutionContext) {
    applyHarnessEnv(env);
    return handleFetchInner(request, env);
  },
  scheduled(controller: ScheduledController, env: PipelineEnv, ctx: ExecutionContext) {
    applyHarnessEnv(env);
    return handleScheduledInner(controller, env, ctx);
  },
  queue(batch: MessageBatch<PipelineJob>, env: PipelineEnv, ctx: ExecutionContext) {
    applyHarnessEnv(env);
    return handleQueueInner(batch, env, ctx);
  },
} satisfies ExportedHandler<PipelineEnv, PipelineJob>;
