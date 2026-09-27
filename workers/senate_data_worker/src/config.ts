/**
 * Environment bindings for the Congress Tracker worker.
 */
import type { SenateBrowserBinding } from "./sources/senate-browser-xml";

export interface Env {
  DB: D1Database;
  /**
   * Static-asset fetcher for the bundled React app (web/dist).
   * Optional so unit tests can construct an Env without the binding.
   */
  ASSETS?: Fetcher;
  /**
   * Cloudflare Browser Rendering binding. Used to fetch Senate.gov LIS XML when
   * plain Worker `fetch` is Akamai-blocked (HTTP 403). Optional in tests.
   */
  BROWSER?: SenateBrowserBinding;
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
  /**
   * Bill summaries (digest/): model for first summaries of new bills (default GPT-6 Luna, high effort, batch) and
   * for rewrites of bills that matter (default Claude Sonnet 5). Set to change without a deploy of code.
   */
  DIGEST_NEW_MODEL?: string;
  /** Key for the per-day reader hash on summary feedback (http/summary-feedback.ts). */
  FEEDBACK_HASH_SECRET?: string;
  DIGEST_REWRITE_MODEL?: string;
  /** Daily spend cap for bill summaries in US dollars (default 1). */
  DIGEST_DAILY_BUDGET_USD?: string;
  /**
   * Base URL for OpenRouter chat calls. Default https://openrouter.ai/api/v1; set to a Cloudflare AI Gateway
   * OpenRouter endpoint to log every call. Batch calls always go to OpenRouter directly.
   */
  OPENROUTER_BASE_URL?: string;
  PIPELINE_ADMIN_TOKEN?: string;
  /**
   * Cloudflare zone ID for trackcongress.org (public). Used with
   * CACHE_PURGE_TOKEN for zone-wide edge cache purge after pipeline writes.
   * Preview overrides this to empty so it cannot target production.
   */
  CF_ZONE_ID?: string;
  /**
   * API token with Zone.Cache Purge permission. Optional; purge is skipped when
   * unset (local/preview). Never commit; set via `wrangler secret put`.
   */
  CACHE_PURGE_TOKEN?: string;
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
