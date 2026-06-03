import type { PipelineJob } from "./platform-types";

/** Bindings shared by the public API worker and the pipeline worker. */
export interface WorkerBindings {
  SENATE_DB: D1Database;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
  ALLOWED_ORIGIN?: string;
  DATA_FRESHNESS_MAX_HOURS?: string;
}

/** Public read API worker (`api-index.ts`). */
export type ApiEnv = WorkerBindings;

/** Pipeline ingestion worker (`index.ts`). */
export interface PipelineEnv extends WorkerBindings {
  CONGRESS_API_KEY: string;
  GOVINFO_API_KEY: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_APP_REFERER?: string;
  OPENROUTER_APP_TITLE?: string;
  OPENROUTER_SHADOW_MODE?: string;
  OPENROUTER_CANARY_PERCENT?: string;
  OPENROUTER_MAX_NEW_ANALYSES?: string;
  PIPELINE_ADMIN_TOKEN?: string;
  EVIDENCE_MAX_BILLS?: string;
  EVIDENCE_BILL_CONCURRENCY?: string;
  EVIDENCE_ENDPOINT_FANOUT?: string;
  ACTIVITY_LOOKBACK_DAYS?: string;
  PIPELINE_QUEUE?: Queue<PipelineJob>;
  QUALITY_MIN_CLAIMS_COVERAGE?: string;
  QUALITY_MIN_QUOTE_VALIDITY?: string;
  QUALITY_MAX_CONFIDENCE_MISMATCH?: string;
  QUALITY_HARD_GATES?: string;
  HARNESS_MODE?: string;
  HARNESS_FIXTURE_SET?: string;
  HARNESS_NOW?: string;
}
