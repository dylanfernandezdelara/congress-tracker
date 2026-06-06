/**
 * Environment bindings for the Senate Data Worker.
 */
export interface Env {
  SENATE_DB: D1Database;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
  ALLOWED_ORIGIN?: string;
}

export function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}
