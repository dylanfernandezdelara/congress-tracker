import type { PipelineJob } from "../platform-types";
import { logEvent } from "./logging";
import type { Env } from "../config";
import { buildRuntime, type Runtime } from "../runtime";
import { materializeReadModelsFromStorage } from "./materialize";

export async function enqueuePipelineJob(env: Env, job: PipelineJob): Promise<boolean> {
  if (!env.PIPELINE_QUEUE) return false;
  try {
    await env.PIPELINE_QUEUE.send(job);
    return true;
  } catch (error) {
    logEvent("pipeline_queue_enqueue_failed", {
      type: job.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function processHistoricalBackfillJob(
  job: Extract<PipelineJob, { type: "historical_backfill" }>
): Promise<void> {
  logEvent("historical_backfill_skipped", {
    congress: job.congress,
    session: job.session ?? null,
    reason: "storage_not_configured",
  });
}

export async function processPipelineJob(
  job: PipelineJob,
  env: Env,
  runtime: Runtime = buildRuntime(env)
): Promise<void> {
  if (job.type === "materialize_read_models") {
    await materializeReadModelsFromStorage(env);
    return;
  }

  if (job.type === "historical_backfill") {
    await processHistoricalBackfillJob(job);
  }
}

export function handleQueue(
  batch: MessageBatch<PipelineJob>,
  env: Env,
  ctx: ExecutionContext,
  runtime: Runtime = buildRuntime(env)
): void {
  for (const message of batch.messages) {
    ctx.waitUntil(
      processPipelineJob(message.body, env, runtime)
        .then(() => message.ack())
        .catch((error) => {
          logEvent("pipeline_queue_job_failed", {
            type: message.body.type,
            error: error instanceof Error ? error.message : String(error),
          });
          message.retry();
        })
    );
  }
}
