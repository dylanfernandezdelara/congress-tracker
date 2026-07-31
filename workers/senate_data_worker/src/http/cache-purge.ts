import type { Env } from "../config";

export type CachePurgeResult =
  | { ok: true; mode: "everything" }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; reason: string };

/**
 * Best-effort Cloudflare **zone-wide** edge cache purge (`purge_everything`).
 *
 * Public feed/stats JSON uses Cache-Control s-maxage; D1 writes do not
 * invalidate that CDN copy. Call after successful pipeline runs (and via
 * POST /__pipeline/purge-cache after manual data repairs).
 *
 * Free-plan zones cannot prefix-purge only `/stats/*`, so this clears the
 * whole zone. No-ops when CF_ZONE_ID or CACHE_PURGE_TOKEN is unset.
 */
export async function purgeZoneEdgeCache(env: Env): Promise<CachePurgeResult> {
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

/** Schedule a zone purge without blocking the caller; never throws. */
export function scheduleZoneEdgeCachePurge(
  env: Env,
  ctx?: Pick<ExecutionContext, "waitUntil">
): void {
  const task = purgeZoneEdgeCache(env);
  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
    return;
  }
  void task;
}
