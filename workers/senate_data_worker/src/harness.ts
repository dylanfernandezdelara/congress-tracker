import {
  canonicalHarnessFixtures,
  type HarnessFixtureEntry,
} from "./harness-fixtures";

export type HarnessMode = "live" | "fixture";

export interface HarnessRuntimeConfig {
  mode: HarnessMode;
  fixtureSet: string | null;
  now: string | null;
}

export interface HarnessFixtureResponse {
  status: number;
  contentType: string;
  body: string;
}

const CANONICAL_FIXTURE_SET = "canonical";
const CANONICAL_HARNESS_NOW = "2026-01-20T15:00:00Z";

/**
 * Harness fixture transport. When `enabled`, `resolve` returns a recorded
 * response for a known URL (or null for an unknown URL, which the caller
 * turns into a 404). Built once per invocation from `Env` and threaded
 * through `FetchConfig` instead of read from module-global state.
 */
export interface FixtureHttp {
  readonly enabled: boolean;
  resolve(url: string): HarnessFixtureResponse | null;
}

export const DISABLED_FIXTURE_HTTP: FixtureHttp = {
  enabled: false,
  resolve: () => null,
};

function normalizeMode(value: string | undefined): HarnessMode {
  return value?.trim().toLowerCase() === "fixture" ? "fixture" : "live";
}

function normalizeFixtureSet(value: string | undefined, mode: HarnessMode): string | null {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return mode === "fixture" ? CANONICAL_FIXTURE_SET : null;
}

function normalizeNow(value: string | undefined, mode: HarnessMode, fixtureSet: string | null): string | null {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  if (mode === "fixture" && fixtureSet === CANONICAL_FIXTURE_SET) {
    return CANONICAL_HARNESS_NOW;
  }
  return null;
}

/** Pure: derive the harness runtime config from env (no global mutation). */
export function buildHarnessConfig(env: {
  HARNESS_MODE?: string;
  HARNESS_FIXTURE_SET?: string;
  HARNESS_NOW?: string;
}): HarnessRuntimeConfig {
  const mode = normalizeMode(env.HARNESS_MODE);
  const fixtureSet = normalizeFixtureSet(env.HARNESS_FIXTURE_SET, mode);
  const now = normalizeNow(env.HARNESS_NOW, mode, fixtureSet);
  return { mode, fixtureSet, now };
}

/** Fixed "now" for fixture runs, or null in live mode. */
export function harnessNowDate(harness: HarnessRuntimeConfig): Date | null {
  if (!harness.now) return null;
  const parsed = new Date(harness.now);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fixtureEntriesForSet(fixtureSet: string | null): HarnessFixtureEntry[] {
  if (fixtureSet === CANONICAL_FIXTURE_SET) {
    return canonicalHarnessFixtures;
  }
  return [];
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.searchParams.delete("api_key");
  parsed.searchParams.sort();
  const search = parsed.searchParams.toString();
  return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ""}`;
}

function buildFixtureMap(entries: HarnessFixtureEntry[]): Map<string, HarnessFixtureResponse> {
  const map = new Map<string, HarnessFixtureResponse>();
  for (const entry of entries) {
    map.set(normalizeUrl(entry.url), {
      status: entry.status ?? 200,
      contentType: entry.contentType,
      body: entry.body,
    });
  }
  return map;
}

/** Build the fixture transport for an invocation from its harness config. */
export function createFixtureHttp(harness: HarnessRuntimeConfig): FixtureHttp {
  if (harness.mode !== "fixture") return DISABLED_FIXTURE_HTTP;
  const map = buildFixtureMap(fixtureEntriesForSet(harness.fixtureSet));
  return {
    enabled: true,
    resolve: (url: string) => map.get(normalizeUrl(url)) ?? null,
  };
}

export function isHarnessFixtureEnv(env: { HARNESS_MODE?: string }): boolean {
  return normalizeMode(env.HARNESS_MODE) === "fixture";
}

export const HARNESS_DEFAULTS = {
  fixtureSet: CANONICAL_FIXTURE_SET,
  now: CANONICAL_HARNESS_NOW,
};
