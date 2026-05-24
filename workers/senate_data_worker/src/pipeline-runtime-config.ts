import { isHarnessFixtureEnv } from "./harness";
import type { PipelineEnv } from "./pipeline-env";
import type { IngestConfig } from "./types";

export function parseBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
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

export function parseCsvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function computePct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

/**
 * Validates environment configuration and throws if invalid.
 * Fails loudly so cron misconfigurations are caught immediately.
 */
export function validateEnv(env: PipelineEnv): IngestConfig {
  const errors: string[] = [];
  const fixtureMode = isHarnessFixtureEnv(env);

  // Validate CONGRESS
  if (!env.CONGRESS) {
    errors.push("CONGRESS environment variable is missing");
  }
  const congress = parseInt(env.CONGRESS, 10);
  if (isNaN(congress) || congress <= 0) {
    errors.push(`CONGRESS must be a positive integer, got: "${env.CONGRESS}"`);
  }

  // Validate SESSION
  if (!env.SESSION) {
    errors.push("SESSION environment variable is missing");
  }
  const session = parseInt(env.SESSION, 10);
  if (isNaN(session) || session <= 0 || session > 2) {
    errors.push(`SESSION must be 1 or 2, got: "${env.SESSION}"`);
  }

  // Validate TARGET_STATE
  if (!env.TARGET_STATE) {
    errors.push("TARGET_STATE environment variable is missing");
  }
  const targetState = env.TARGET_STATE?.trim().toUpperCase() ?? "";
  if (!(targetState === "ALL" || /^[A-Z]{2}$/.test(targetState))) {
    errors.push(
      `TARGET_STATE must be a 2-letter state code or "ALL", got: "${env.TARGET_STATE}"`
    );
  }

  if (!env.CONGRESS_API_KEY && !fixtureMode) {
    errors.push("CONGRESS_API_KEY is missing");
  }
  if (!env.GOVINFO_API_KEY && !fixtureMode) {
    errors.push("GOVINFO_API_KEY is missing");
  }

  // Fail loudly if any validation errors
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
