import { parseConfig, type Config, type Env } from "./config";
import {
  buildHarnessConfig,
  createFixtureHttp,
  harnessNowDate,
  type FixtureHttp,
  type HarnessRuntimeConfig,
} from "./harness";

/**
 * Injectable clock. Production uses the wall clock; the harness pins it to a
 * fixed instant so date-derived ingestion targets are deterministic.
 */
export interface Clock {
  now(): Date;
}

/**
 * Per-invocation runtime context. Built once in `worker.ts` and threaded into
 * the pipeline instead of reading module-global state. Bundles the parsed
 * `Config`, the `Clock`, and the harness fixture transport.
 */
export interface Runtime {
  clock: Clock;
  config: Config;
  harness: HarnessRuntimeConfig;
  fixtureHttp: FixtureHttp;
}

/**
 * Construct the runtime for a single worker invocation from its `Env`.
 * Replaces the old `applyHarnessEnv` module-global mutation.
 */
export function buildRuntime(env: Env): Runtime {
  const harness = buildHarnessConfig(env);
  const fixedNow = harnessNowDate(harness);
  return {
    clock: { now: () => fixedNow ?? new Date() },
    config: parseConfig(env),
    harness,
    fixtureHttp: createFixtureHttp(harness),
  };
}
