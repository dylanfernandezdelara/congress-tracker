/**
 * Environment bindings for the Congress Tracker worker.
 */
export interface Env {
  DB: D1Database;
  CONGRESS: string;
  SESSION: string;
  ALLOWED_ORIGIN?: string;
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
