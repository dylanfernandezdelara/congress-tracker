/**
 * Worker pipeline tasks that `scripts/prod-data.mjs` can run from this machine against the production database.
 * Each one is the worker's own code; add a task here when a one-time repair or backfill needs to run on demand.
 */
import type { Env } from "../src/config";
import { recheckStoredLaws } from "../src/pipeline/refresh-lifecycles";

export interface TaskOptions {
  apply: boolean;
  limit: number | null;
}

export const tasks: Record<string, (env: Env, opts: TaskOptions) => Promise<object>> = {
  /** Re-read laws stored by an earlier parser from Congress.gov; reports each status change. */
  "lifecycle-recheck": (env, opts) =>
    recheckStoredLaws(env, { limit: opts.limit ?? 500, apply: opts.apply, trigger: "prod-data" }),
};
