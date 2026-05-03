import type { MetaJson, MetaKeys, SnapshotJson } from "./types";

export interface StateKeyLayout extends MetaKeys {
  meta: string;
}

export interface MemberKeyLayout {
  latest: string;
  snapshot: string;
}

function normalizeState(state: string): string {
  return state.trim().toUpperCase();
}

function normalizeBioguide(bioguideId: string): string {
  return bioguideId.trim().toUpperCase();
}

export function buildLatestKey(state: string): string {
  return `state/${normalizeState(state)}/latest.json`;
}

export function buildSnapshotKey(state: string, voteDate: string): string {
  return `state/${normalizeState(state)}/${voteDate}.json`;
}

export function buildMetaKey(state: string): string {
  return `state/${normalizeState(state)}/_meta.json`;
}

export function buildStateKeys(state: string, voteDate: string): StateKeyLayout {
  return {
    latest: buildLatestKey(state),
    snapshot: buildSnapshotKey(state, voteDate),
    meta: buildMetaKey(state),
  };
}

export function buildMemberLatestKey(bioguideId: string): string {
  return `member/${normalizeBioguide(bioguideId)}/latest.json`;
}

export function buildMemberSnapshotKey(bioguideId: string, date: string): string {
  return `member/${normalizeBioguide(bioguideId)}/${date}.json`;
}

export function buildMemberKeys(
  bioguideId: string,
  date: string
): MemberKeyLayout {
  return {
    latest: buildMemberLatestKey(bioguideId),
    snapshot: buildMemberSnapshotKey(bioguideId, date),
  };
}

export function buildMembersIndexKey(): string {
  return "members/index.json";
}

export function buildActivitiesIndexKey(): string {
  return "activities/index.json";
}

export function buildVoteLedgerKey(): string {
  return "votes/ledger.json";
}

export function buildSessionOverviewKey(): string {
  return "stats/overview.json";
}

export function buildBillEvidenceKey(billKey: string): string {
  return `bills/evidence/${billKey}.json`;
}

export function buildBillNarrativeKey(billKey: string): string {
  return `bills/narrative/${billKey}.json`;
}

export function buildBillTrendSnapshotKey(
  congress: number,
  billKey: string,
  snapshotDate: string
): string {
  return `bills/trends/${congress}/${billKey}/${snapshotDate}.json`;
}

export function buildCoverageSnapshotKey(snapshotDate: string): string {
  return `stats/coverage/${snapshotDate}.json`;
}

export function buildLatestBriefingKey(): string {
  return "briefings/latest.json";
}

export function buildLatestChamberContextKey(): string {
  return "platform/context/chamber/latest.json";
}

export function buildChamberContextKey(snapshotDate: string): string {
  return `platform/context/chamber/${snapshotDate}.json`;
}

export function buildVoteDetailKey(
  congress: number,
  session: number,
  voteNumber: number
): string {
  return `votes/detail/${congress}/${session}/${voteNumber}.json`;
}

export function buildSourceArtifactKey(
  source: string,
  entityKey: string,
  fetchedAt: string,
  extension: "json" | "xml" | "txt" | "html" = "json"
): string {
  const safeSource = source.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeEntityKey = entityKey.trim().toLowerCase().replace(/[^a-z0-9/_-]+/g, "-");
  const safeFetchedAt = fetchedAt.slice(0, 19).replace(/[:T]/g, "-");
  return `sources/${safeSource}/${safeFetchedAt}/${safeEntityKey}.${extension}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface R2WriteOptions {
  retries?: number;
  baseDelayMs?: number;
  skipIfExists?: boolean;
  skipIfUnchanged?: boolean;
  jsonVolatileKeys?: string[];
}

const DEFAULT_JSON_VOLATILE_KEYS = new Set(["generated_at", "run_id"]);

function normalizeJsonForComparison(
  value: unknown,
  volatileKeys: ReadonlySet<string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonForComparison(item, volatileKeys));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (volatileKeys.has(key)) continue;
    normalized[key] = normalizeJsonForComparison(
      (value as Record<string, unknown>)[key],
      volatileKeys
    );
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (!value || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function equivalentJsonPayloads(
  current: string,
  next: string,
  volatileKeys: ReadonlySet<string>
): boolean {
  try {
    const currentNormalized = normalizeJsonForComparison(JSON.parse(current), volatileKeys);
    const nextNormalized = normalizeJsonForComparison(JSON.parse(next), volatileKeys);
    return stableStringify(currentNormalized) === stableStringify(nextNormalized);
  } catch {
    return current === next;
  }
}

async function objectExists(bucket: R2Bucket, key: string): Promise<boolean> {
  if (typeof bucket.head !== "function") {
    return false;
  }

  try {
    return Boolean(await bucket.head(key));
  } catch (error) {
    console.warn(
      `[r2] Failed to check existing object ${key}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

async function readStringForComparison(bucket: R2Bucket, key: string): Promise<string | null> {
  if (typeof bucket.get !== "function") {
    return null;
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      return null;
    }
    return await object.text();
  } catch (error) {
    console.warn(
      `[r2] Failed to read existing object ${key} for comparison: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

async function shouldSkipWriteToR2(
  bucket: R2Bucket,
  key: string,
  data: string,
  contentType: string,
  options: R2WriteOptions
): Promise<boolean> {
  if (options.skipIfExists && (await objectExists(bucket, key))) {
    console.log(`[r2] Skipped existing ${key}`);
    return true;
  }

  if (!options.skipIfUnchanged) {
    return false;
  }

  const current = await readStringForComparison(bucket, key);
  if (current === null) {
    return false;
  }

  const unchanged = contentType.includes("json")
    ? equivalentJsonPayloads(
        current,
        data,
        new Set([...(options.jsonVolatileKeys ?? []), ...DEFAULT_JSON_VOLATILE_KEYS])
      )
    : current === data;
  if (unchanged) {
    console.log(`[r2] Skipped unchanged ${key}`);
  }
  return unchanged;
}

async function writeStringToR2(
  bucket: R2Bucket,
  key: string,
  data: string,
  contentType: string,
  options: R2WriteOptions = {}
): Promise<void> {
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? 250);

  if (await shouldSkipWriteToR2(bucket, key, data, contentType, options)) {
    return;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await bucket.put(key, data, {
        httpMetadata: {
          contentType,
        },
      });
      console.log(`[r2] Wrote ${key} (${data.length} bytes)`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[r2] Write failed for ${key}; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error(
    `[r2] Failed to write ${key}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

export async function writeJsonToR2(
  bucket: R2Bucket,
  key: string,
  data: unknown,
  options: R2WriteOptions = {}
): Promise<void> {
  await writeStringToR2(bucket, key, JSON.stringify(data), "application/json", options);
}

export async function writeJsonToR2IfChanged(
  bucket: R2Bucket,
  key: string,
  data: unknown,
  options: R2WriteOptions = {}
): Promise<void> {
  await writeJsonToR2(bucket, key, data, { ...options, skipIfUnchanged: true });
}

export async function writeTextToR2(
  bucket: R2Bucket,
  key: string,
  data: string,
  options: R2WriteOptions & { contentType?: string } = {}
): Promise<void> {
  await writeStringToR2(
    bucket,
    key,
    data,
    options.contentType ?? "text/plain; charset=utf-8",
    options
  );
}

export async function writeTextToR2IfMissing(
  bucket: R2Bucket,
  key: string,
  data: string,
  options: R2WriteOptions & { contentType?: string } = {}
): Promise<void> {
  await writeTextToR2(bucket, key, data, { ...options, skipIfExists: true });
}

export async function readJsonFromR2<T>(
  bucket: R2Bucket,
  key: string
): Promise<T | null> {
  try {
    const object = await bucket.get(key);
    if (!object) {
      return null;
    }
    let text: string;
    try {
      text = await object.text();
    } catch (error) {
      console.error(
        `[r2] Failed to read object text for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }

    if (!text.trim()) {
      console.warn(`[r2] Empty JSON payload for ${key}`);
      return null;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      console.error(
        `[r2] Invalid JSON payload for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  } catch (error) {
    console.error(
      `[r2] Failed to read object ${key}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

export async function readTextFromR2(
  bucket: R2Bucket,
  key: string
): Promise<string | null> {
  try {
    const object = await bucket.get(key);
    if (!object) {
      return null;
    }

    try {
      const text = await object.text();
      return text.trim() ? text : null;
    } catch (error) {
      console.error(
        `[r2] Failed to read object text for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  } catch (error) {
    console.error(
      `[r2] Failed to read object ${key}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Publish ingestion results to R2 in a consistent, reader-safe order.
 *
 * Write order: snapshot → latest → meta.
 */
export async function publishToR2(
  bucket: R2Bucket,
  snapshot: SnapshotJson,
  meta: MetaJson
): Promise<void> {
  const keys = buildStateKeys(meta.state, meta.target_vote_date);

  console.log("[r2] Publishing to R2...");
  console.log(`[r2]   - Snapshot: ${keys.snapshot}`);
  console.log(`[r2]   - Latest: ${keys.latest}`);
  console.log(`[r2]   - Meta: ${keys.meta}`);

  await writeJsonToR2IfChanged(bucket, keys.snapshot, snapshot);
  await writeJsonToR2IfChanged(bucket, keys.latest, snapshot);
  await writeJsonToR2IfChanged(bucket, keys.meta, meta);

  console.log("[r2] Publish complete");
}
