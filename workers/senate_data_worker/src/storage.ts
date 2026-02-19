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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface R2WriteOptions {
  retries?: number;
  baseDelayMs?: number;
}

export async function writeJsonToR2(
  bucket: R2Bucket,
  key: string,
  data: unknown,
  options: R2WriteOptions = {}
): Promise<void> {
  const json = JSON.stringify(data);
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? 250);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await bucket.put(key, json, {
        httpMetadata: {
          contentType: "application/json",
        },
      });
      console.log(`[r2] Wrote ${key} (${json.length} bytes)`);
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

export async function readJsonFromR2<T>(
  bucket: R2Bucket,
  key: string
): Promise<T | null> {
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

  await writeJsonToR2(bucket, keys.snapshot, snapshot);
  await writeJsonToR2(bucket, keys.latest, snapshot);
  await writeJsonToR2(bucket, keys.meta, meta);

  console.log("[r2] Publish complete");
}

