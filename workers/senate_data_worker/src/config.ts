/**
 * Environment bindings for the Congress Tracker worker.
 */
export interface Env {
  DB: D1Database;
  /**
   * Static-asset fetcher for the bundled React app (web/dist).
   * Optional so unit tests can construct an Env without the binding.
   */
  ASSETS?: Fetcher;
  CONGRESS: string;
  SESSION: string;
  ALLOWED_ORIGIN?: string;
  /** Local dev only: set to 1 in .dev.vars to allow POST /__pipeline/run/* without PIPELINE_ADMIN_TOKEN. */
  DEV_OPEN_PIPELINE?: string;
  /** Local dev only: set to 1 in .dev.vars to allow synthetic disclosure seeding. */
  ENABLE_SAMPLE_DISCLOSURES?: string;
  CONGRESS_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  PIPELINE_ADMIN_TOKEN?: string;
}

export function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

export function congressNumber(env: Env): number {
  return parseIntSafe(env.CONGRESS, 119);
}

export function sessionNumber(env: Env): number {
  return parseIntSafe(env.SESSION, 2);
}
