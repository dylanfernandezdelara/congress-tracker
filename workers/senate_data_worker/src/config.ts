import { isReplayDataSource } from "./harness";
import type { PipelineJob } from "./platform-types";
import type { IngestConfig } from "./types";

/**
 * Single environment-binding type for the unified worker (`worker.ts`):
 * D1, public-API vars, ingestion/source keys, evidence knobs,
 * the optional queue, and the HTTP replay fixture switches.
 */
export interface Env {
  SENATE_DB: D1Database;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
  ALLOWED_ORIGIN?: string;
  DATA_FRESHNESS_MAX_HOURS?: string;
  CONGRESS_API_KEY: string;
  GOVINFO_API_KEY: string;
  PIPELINE_ADMIN_TOKEN?: string;
  EVIDENCE_MAX_BILLS?: string;
  EVIDENCE_BILL_CONCURRENCY?: string;
  EVIDENCE_ENDPOINT_FANOUT?: string;
  ACTIVITY_LOOKBACK_DAYS?: string;
  PIPELINE_QUEUE?: Queue<PipelineJob>;
  DATA_SOURCE?: string;
  REPLAY_FIXTURE_SET?: string;
  CLOCK?: string;
}

// ============================================================================
// Primitive env parsers
// ============================================================================

export function parseBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

export function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

export function parsePct(value: string | undefined, fallback: number): number {
  return Math.max(0, Math.min(parseIntSafe(value, fallback), 100));
}

export function computePct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

/**
 * Validates required ingestion env and throws if invalid.
 * Fails loudly so cron misconfigurations are caught immediately.
 */
export function validateEnv(env: Env): IngestConfig {
  const errors: string[] = [];
  const replayMode = isReplayDataSource(env);

  if (!env.CONGRESS) {
    errors.push("CONGRESS environment variable is missing");
  }
  const congress = parseInt(env.CONGRESS, 10);
  if (isNaN(congress) || congress <= 0) {
    errors.push(`CONGRESS must be a positive integer, got: "${env.CONGRESS}"`);
  }

  if (!env.SESSION) {
    errors.push("SESSION environment variable is missing");
  }
  const session = parseInt(env.SESSION, 10);
  if (isNaN(session) || session <= 0 || session > 2) {
    errors.push(`SESSION must be 1 or 2, got: "${env.SESSION}"`);
  }

  if (!env.TARGET_STATE) {
    errors.push("TARGET_STATE environment variable is missing");
  }
  const targetState = env.TARGET_STATE?.trim().toUpperCase() ?? "";
  if (!(targetState === "ALL" || /^[A-Z]{2}$/.test(targetState))) {
    errors.push(`TARGET_STATE must be a 2-letter state code or "ALL", got: "${env.TARGET_STATE}"`);
  }

  if (!env.CONGRESS_API_KEY && !replayMode) {
    errors.push("CONGRESS_API_KEY is missing");
  }
  if (!env.GOVINFO_API_KEY && !replayMode) {
    errors.push("GOVINFO_API_KEY is missing");
  }

  if (errors.length > 0) {
    const errorMsg = `[scheduled] CONFIGURATION ERROR:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return {
    congress,
    session,
    targetState,
    congressApiKey: env.CONGRESS_API_KEY || "HARNESS_FIXTURE_KEY",
  };
}

// ============================================================================
// Parsed pipeline configuration (parsed once, passed to stages)
// ============================================================================

const DEFAULT_DATA_FRESHNESS_MAX_HOURS = 36;
const DEFAULT_ACTIVITY_LOOKBACK_DAYS = 30;
const DEFAULT_EVIDENCE_MAX_BILLS = 30;
const DEFAULT_EVIDENCE_BILL_CONCURRENCY = 2;
const DEFAULT_EVIDENCE_ENDPOINT_FANOUT = 3;

export interface EvidenceConfig {
  maxBills: number;
  billConcurrency: number;
  endpointFanout: number;
}

export interface Config {
  congress: number;
  session: number;
  targetState: string;
  congressApiKey: string;
  govInfoApiKey: string;
  replayMode: boolean;
  dataFreshnessMaxHours: number;
  activityLookbackDays: number;
  evidence: EvidenceConfig;
}

/**
 * Parse all pipeline env knobs once. Stages take the resulting `Config`
 * instead of re-reading and re-parsing `env.*` in multiple modules.
 */
export function parseConfig(env: Env): Config {
  const ingest = validateEnv(env);
  const replayMode = isReplayDataSource(env);

  return {
    congress: ingest.congress,
    session: ingest.session,
    targetState: ingest.targetState,
    congressApiKey: env.CONGRESS_API_KEY || ingest.congressApiKey,
    govInfoApiKey: env.GOVINFO_API_KEY || "HARNESS_FIXTURE_KEY",
    replayMode,
    dataFreshnessMaxHours: Math.max(
      1,
      parseIntSafe(env.DATA_FRESHNESS_MAX_HOURS, DEFAULT_DATA_FRESHNESS_MAX_HOURS)
    ),
    activityLookbackDays: Math.max(
      7,
      Math.min(parseIntSafe(env.ACTIVITY_LOOKBACK_DAYS, DEFAULT_ACTIVITY_LOOKBACK_DAYS), 120)
    ),
    evidence: {
      maxBills: Math.max(5, parseIntSafe(env.EVIDENCE_MAX_BILLS, DEFAULT_EVIDENCE_MAX_BILLS)),
      billConcurrency: Math.max(
        1,
        Math.min(parseIntSafe(env.EVIDENCE_BILL_CONCURRENCY, DEFAULT_EVIDENCE_BILL_CONCURRENCY), 3)
      ),
      endpointFanout: Math.max(
        1,
        Math.min(parseIntSafe(env.EVIDENCE_ENDPOINT_FANOUT, DEFAULT_EVIDENCE_ENDPOINT_FANOUT), 4)
      ),
    },
  };
}
