import type { Env } from "../config";

export type CachePurgeResult =
  | { ok: true; mode: "everything" }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; reason: string };

/**
 * Best-effort purge of Cloudflare edge cache for the production zone.
 *
 * Public feed/stats JSON uses Cache-Control s-maxage; D1 writes do not
 * invalidate that CDN copy. Call after successful pipeline runs (and after
 * manual data repairs via POST /__pipeline/purge-cache).
 *
 * No-ops when CF_ZONE_ID or CACHE_PURGE_TOKEN is unset (local/preview).
 */
export async function purgePublicApiCache(env: Env): Promise<CachePurgeResult> {
  const zoneId = env.CF_ZONE_ID?.trim();
  const token = env.CACHE_PURGE_TOKEN?.trim();
  if (!zoneId || !token) {
    return {
      ok: false,
      skipped: true,
      reason: !zoneId ? "CF_ZONE_ID unset" : "CACHE_PURGE_TOKEN unset",
    };
  }

  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ purge_everything: true }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const reason = `Cloudflare purge HTTP ${response.status}${
        body ? `: ${body.slice(0, 200)}` : ""
      }`;
      console.error(
        JSON.stringify({
          event: "cache_purge_failed",
          reason,
        })
      );
      return { ok: false, skipped: false, reason };
    }
    console.log(JSON.stringify({ event: "cache_purge_ok", mode: "everything" }));
    return { ok: true, mode: "everything" };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "cache_purge_failed",
        reason,
      })
    );
    return { ok: false, skipped: false, reason };
  }
}

/** Fire-and-forget purge; never throws into the pipeline success path. */
export function schedulePublicApiCachePurge(
  env: Env,
  ctx?: Pick<ExecutionContext, "waitUntil">
): void {
  const task = purgePublicApiCache(env).then((result) => {
    if (!result.ok && !result.skipped) {
      // Already logged in purgePublicApiCache.
    }
  });
  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
    return;
  }
  // No ExecutionContext (unit tests / unusual hosts): still run, ignore result.
  void task;
}
