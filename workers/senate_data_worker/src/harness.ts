import {
  canonicalHarnessFixtures,
  type HarnessFixtureEntry,
} from "./harness-fixtures";

export type DataSource = "live" | "replay";

export interface HarnessRuntimeConfig {
  dataSource: DataSource;
  replayFixtureSet: string | null;
  clock: string | null;
}

export interface HarnessFixtureResponse {
  status: number;
  contentType: string;
  body: string;
}

const CANONICAL_REPLAY_FIXTURE_SET = "canonical";
const CANONICAL_CLOCK = "2026-01-20T15:00:00Z";

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

function normalizeDataSource(value: string | undefined): DataSource {
  return value?.trim().toLowerCase() === "replay" ? "replay" : "live";
}

function normalizeReplayFixtureSet(
  value: string | undefined,
  dataSource: DataSource,
): string | null {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return dataSource === "replay" ? CANONICAL_REPLAY_FIXTURE_SET : null;
}

function normalizeClock(
  value: string | undefined,
  dataSource: DataSource,
  replayFixtureSet: string | null,
): string | null {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  if (dataSource === "replay" && replayFixtureSet === CANONICAL_REPLAY_FIXTURE_SET) {
    return CANONICAL_CLOCK;
  }
  return null;
}

/** Pure: derive the harness runtime config from env (no global mutation). */
export function buildHarnessConfig(env: {
  DATA_SOURCE?: string;
  REPLAY_FIXTURE_SET?: string;
  CLOCK?: string;
}): HarnessRuntimeConfig {
  const dataSource = normalizeDataSource(env.DATA_SOURCE);
  const replayFixtureSet = normalizeReplayFixtureSet(env.REPLAY_FIXTURE_SET, dataSource);
  const clock = normalizeClock(env.CLOCK, dataSource, replayFixtureSet);
  return { dataSource, replayFixtureSet, clock };
}

/** Fixed "now" for replay runs, or null in live mode. */
export function harnessNowDate(harness: HarnessRuntimeConfig): Date | null {
  if (!harness.clock) return null;
  const parsed = new Date(harness.clock);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fixtureEntriesForSet(replayFixtureSet: string | null): HarnessFixtureEntry[] {
  if (replayFixtureSet === CANONICAL_REPLAY_FIXTURE_SET) {
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
  if (harness.dataSource !== "replay") return DISABLED_FIXTURE_HTTP;
  const map = buildFixtureMap(fixtureEntriesForSet(harness.replayFixtureSet));
  return {
    enabled: true,
    resolve: (url: string) => map.get(normalizeUrl(url)) ?? null,
  };
}

export function isReplayDataSource(env: { DATA_SOURCE?: string }): boolean {
  return normalizeDataSource(env.DATA_SOURCE) === "replay";
}

export const REPLAY_DEFAULTS = {
  replayFixtureSet: CANONICAL_REPLAY_FIXTURE_SET,
  clock: CANONICAL_CLOCK,
};
