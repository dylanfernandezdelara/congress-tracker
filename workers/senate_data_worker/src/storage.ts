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

export async function writeJsonToR2(
  bucket: R2Bucket,
  key: string,
  data: unknown
): Promise<void> {
  const json = JSON.stringify(data);
  await bucket.put(key, json, {
    httpMetadata: {
      contentType: "application/json",
    },
  });
  console.log(`[r2] Wrote ${key} (${json.length} bytes)`);
}

export async function readJsonFromR2<T>(
  bucket: R2Bucket,
  key: string
): Promise<T | null> {
  const object = await bucket.get(key);
  if (!object) {
    return null;
  }
  const text = await object.text();
  return JSON.parse(text) as T;
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

