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
const DEFAULT_RUNTIME: HarnessRuntimeConfig = {
  mode: "live",
  fixtureSet: null,
  now: null,
};

let currentRuntime: HarnessRuntimeConfig = { ...DEFAULT_RUNTIME };

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

export function applyHarnessEnv(env: {
  HARNESS_MODE?: string;
  HARNESS_FIXTURE_SET?: string;
  HARNESS_NOW?: string;
}): HarnessRuntimeConfig {
  const mode = normalizeMode(env.HARNESS_MODE);
  const fixtureSet = normalizeFixtureSet(env.HARNESS_FIXTURE_SET, mode);
  const now = normalizeNow(env.HARNESS_NOW, mode, fixtureSet);
  currentRuntime = { mode, fixtureSet, now };
  return currentRuntime;
}

export function resetHarnessRuntime(): void {
  currentRuntime = { ...DEFAULT_RUNTIME };
}

export function getHarnessRuntime(): HarnessRuntimeConfig {
  return currentRuntime;
}

export function isHarnessFixtureMode(): boolean {
  return currentRuntime.mode === "fixture";
}

export function getHarnessNowDate(): Date | null {
  if (!currentRuntime.now) return null;
  const parsed = new Date(currentRuntime.now);
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

let cachedFixtureSet: string | null = null;
let cachedFixtureMap: Map<string, HarnessFixtureResponse> | null = null;

function getFixtureMap(): Map<string, HarnessFixtureResponse> {
  if (cachedFixtureMap && cachedFixtureSet === currentRuntime.fixtureSet) {
    return cachedFixtureMap;
  }
  cachedFixtureSet = currentRuntime.fixtureSet;
  cachedFixtureMap = buildFixtureMap(fixtureEntriesForSet(currentRuntime.fixtureSet));
  return cachedFixtureMap;
}

export function resolveHarnessFixtureResponse(url: string): HarnessFixtureResponse | null {
  if (!isHarnessFixtureMode()) return null;
  const fixture = getFixtureMap().get(normalizeUrl(url));
  return fixture ?? null;
}

export function isHarnessFixtureEnv(env: { HARNESS_MODE?: string }): boolean {
  return normalizeMode(env.HARNESS_MODE) === "fixture";
}

export const HARNESS_DEFAULTS = {
  fixtureSet: CANONICAL_FIXTURE_SET,
  now: CANONICAL_HARNESS_NOW,
};
