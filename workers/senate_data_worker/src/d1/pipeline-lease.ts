import { PIPELINE_LEASE_TTL_MS, PIPELINE_WRITE_LEASE_NAME } from "../constants";
import { ensureSchema } from "./schema";

export class PipelineBusyError extends Error {
  readonly leaseName: string;

  constructor(leaseName: string) {
    super("pipeline_busy");
    this.name = "PipelineBusyError";
    this.leaseName = leaseName;
  }
}

type LeaseValue = {
  holder: string;
  expires_at: string;
};

function leaseKey(name: string): string {
  return `pipeline_lease:${name}`;
}

function newHolder(): string {
  return crypto.randomUUID();
}

/**
 * Acquire a named D1 lease if unheld or expired.
 * Returns the holder token on success, or null if another holder is active.
 */
export async function acquirePipelineLease(
  db: D1Database,
  leaseName: string,
  ttlMs: number = PIPELINE_LEASE_TTL_MS,
  now: Date = new Date()
): Promise<string | null> {
  await ensureSchema(db);
  const holder = newHolder();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const value: LeaseValue = { holder, expires_at: expiresAt };
  const key = leaseKey(leaseName);

  const result = await db
    .prepare(
      `INSERT INTO pipeline_state (key, value_json, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at
       WHERE json_extract(pipeline_state.value_json, '$.expires_at') IS NULL
          OR json_extract(pipeline_state.value_json, '$.expires_at') <= ?4`
    )
    .bind(key, JSON.stringify(value), nowIso, nowIso)
    .run();

  const changes = result.meta?.changes ?? 0;
  if (changes > 0) return holder;

  // Confirm we did not already hold it (defensive; INSERT path should have changes).
  const row = await db
    .prepare(`SELECT value_json FROM pipeline_state WHERE key = ?1`)
    .bind(key)
    .first<{ value_json: string }>();
  if (!row?.value_json) return null;
  try {
    const parsed = JSON.parse(row.value_json) as LeaseValue;
    return parsed.holder === holder ? holder : null;
  } catch {
    return null;
  }
}

/** Release a lease only if we still hold it. */
export async function releasePipelineLease(
  db: D1Database,
  leaseName: string,
  holder: string
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `DELETE FROM pipeline_state
       WHERE key = ?1
         AND json_extract(value_json, '$.holder') = ?2`
    )
    .bind(leaseKey(leaseName), holder)
    .run();
}

/**
 * Run `fn` under the global write lease. Throws PipelineBusyError if held.
 * Always releases on completion or error.
 */
export async function withPipelineLease<T>(
  db: D1Database,
  fn: () => Promise<T>,
  options: {
    leaseName?: string;
    ttlMs?: number;
    now?: Date;
  } = {}
): Promise<T> {
  const leaseName = options.leaseName ?? PIPELINE_WRITE_LEASE_NAME;
  const holder = await acquirePipelineLease(db, leaseName, options.ttlMs, options.now);
  if (!holder) {
    throw new PipelineBusyError(leaseName);
  }
  try {
    return await fn();
  } finally {
    try {
      await releasePipelineLease(db, leaseName, holder);
    } catch (releaseErr: unknown) {
      // Never mask the pipeline error (or success) if release fails; TTL still expires.
      console.error(
        JSON.stringify({
          event: "pipeline_lease_release_failed",
          leaseName,
          error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
        })
      );
    }
  }
}

export function isPipelineBusyError(err: unknown): err is PipelineBusyError {
  return err instanceof PipelineBusyError;
}
