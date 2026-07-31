import { afterEach, describe, expect, it, vi } from "vitest";
import { purgePublicApiCache, schedulePublicApiCachePurge } from "./cache-purge";

describe("purgePublicApiCache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips when zone or token is missing", async () => {
    await expect(purgePublicApiCache({} as never)).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: "CF_ZONE_ID unset",
    });
    await expect(
      purgePublicApiCache({ CF_ZONE_ID: "zone" } as never)
    ).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: "CACHE_PURGE_TOKEN unset",
    });
  });

  it("purges everything when credentials are present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      purgePublicApiCache({
        CF_ZONE_ID: "zone-123",
        CACHE_PURGE_TOKEN: "token-abc",
      } as never)
    ).resolves.toEqual({ ok: true, mode: "everything" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token-abc",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
      })
    );
  });

  it("returns failure details when Cloudflare rejects the purge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 403 }))
    );

    await expect(
      purgePublicApiCache({
        CF_ZONE_ID: "zone-123",
        CACHE_PURGE_TOKEN: "token-abc",
      } as never)
    ).resolves.toEqual({
      ok: false,
      skipped: false,
      reason: "Cloudflare purge HTTP 403: nope",
    });
  });
});

describe("schedulePublicApiCachePurge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses waitUntil when an ExecutionContext is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const waitUntil = vi.fn((p: Promise<unknown>) => p);

    schedulePublicApiCachePurge(
      { CF_ZONE_ID: "zone-123", CACHE_PURGE_TOKEN: "token-abc" } as never,
      { waitUntil }
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]![0];
    expect(fetchMock).toHaveBeenCalled();
  });
});
