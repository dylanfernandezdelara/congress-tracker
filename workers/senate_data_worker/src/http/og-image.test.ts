import { describe, expect, it, vi } from "vitest";

import type { Env } from "../config";
import { ogCardVersion, type OgCardModel } from "../../../../shared/og-card";
import type { LoadOgCardModelResult } from "./og-card-model";
import {
  handleOgImageRoute,
  OG_IMAGE_CACHE_CONTROL,
  OG_IMAGE_FALLBACK_CACHE_CONTROL,
  parseOgImagePath,
} from "./og-image";
import { createMockEnv } from "./test-fixtures";

const CARD: OgCardModel = {
  docket: "H.R. 1 · 119th Congress",
  headline: "House passes a permitting package",
  quote: null,
  status_line: "Passed House 219–213 · Sep 3, 2026",
  tally: { chamber: "House", yeas: 219, nays: 213, party_splits: [] },
};

function pngResponse(body = "png-bytes"): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

function mockCache(hit?: Response) {
  return {
    match: vi.fn<(request: Request) => Promise<Response | undefined>>(async () => hit),
    put: vi.fn<(request: Request, response: Response) => Promise<void>>(async () => {}),
  };
}

function envWithAssets(asset: Response | null = pngResponse("asset-png")): Env {
  return createMockEnv({
    ASSETS: asset
      ? { fetch: vi.fn(async () => asset) }
      : undefined,
  }) as unknown as Env;
}

async function route(
  path: string,
  init: {
    method?: string;
    env?: Env;
    ctx?: Pick<ExecutionContext, "waitUntil">;
    render?: (html: string) => Promise<Response>;
    loadModel?: (
      env: Env,
      bill: { congress: number; type: string; number: number },
      quoteId: string | null
    ) => Promise<LoadOgCardModelResult>;
    cache?: ReturnType<typeof mockCache>;
  } = {}
): Promise<Response> {
  const url = new URL(`https://worker.example.com${path}`);
  return handleOgImageRoute({
    request: new Request(url, { method: init.method ?? "GET" }),
    env: init.env ?? envWithAssets(),
    url,
    ctx: init.ctx,
    deps: {
      render: init.render ?? (async () => pngResponse()),
      loadModel:
        init.loadModel ??
        (async () => ({ ok: true, model: CARD })),
      cache: (init.cache ?? mockCache()) as unknown as Cache,
    },
  });
}

describe("parseOgImagePath", () => {
  it("returns the bill param for /og/bill/<id>.png", () => {
    expect(parseOgImagePath("/og/bill/119-hr-1.png")).toBe("119-hr-1");
    expect(parseOgImagePath("/og/bill/119-sres-12.png")).toBe("119-sres-12");
  });

  it("rejects other paths", () => {
    expect(parseOgImagePath("/og/bill/119-hr-1.jpg")).toBeNull();
    expect(parseOgImagePath("/og/bill/119-hr-1.png/extra")).toBeNull();
    expect(parseOgImagePath("/feed/latest.json")).toBeNull();
    expect(parseOgImagePath("/og/bill/.png")).toBeNull();
  });
});

describe("handleOgImageRoute", () => {
  it("returns 405 plain text for non-GET", async () => {
    const res = await route("/og/bill/119-hr-1.png", { method: "POST" });
    expect(res.status).toBe(405);
    expect(await res.text()).toBe("Method Not Allowed");
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
  });

  it("returns 404 plain text for a bad path or bill param", async () => {
    const missing = await route("/og/other.png");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("Not Found");

    const invalid = await route("/og/bill/not-a-bill.png");
    expect(invalid.status).toBe(404);
  });

  it("returns a cache hit without rendering, keyed by the server-side content version", async () => {
    const cached = pngResponse("from-cache");
    cached.headers.set("x-og-card", "rendered");
    const cache = mockCache(cached);
    const render = vi.fn(async () => pngResponse());
    const res = await route("/og/bill/119-hr-1.png?v=abc&junk=1&other=2", { cache, render });
    expect(await res.text()).toBe("from-cache");
    expect(render).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    const key = cache.match.mock.calls[0]![0];
    expect(key.url).toBe(`https://worker.example.com/og/bill/119-hr-1.png?v=${ogCardVersion(CARD)}`);
  });

  it("collapses junk query strings onto one cache key so unknown params cannot force re-renders", async () => {
    const cache = mockCache();
    await route("/og/bill/119-hr-1.png?v=attacker-1&x=1", { cache });
    await route("/og/bill/119-hr-1.png?v=attacker-2&y=2", { cache });
    const [first, second] = cache.match.mock.calls.map(([req]) => req.url);
    expect(first).toBe(second);
    expect(first).not.toContain("attacker");
  });

  it("returns the static fallback when the model is missing and does not cache it", async () => {
    const cache = mockCache();
    const env = envWithAssets(pngResponse("static-og"));
    const res = await route("/og/bill/119-hr-1.png", {
      env,
      cache,
      loadModel: async () => ({ ok: false, reason: "bill_not_found" }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("static-og");
    expect(res.headers.get("x-og-card")).toBe("fallback");
    expect(res.headers.get("cache-control")).toBe(OG_IMAGE_FALLBACK_CACHE_CONTROL);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("falls back with x-og-card fallback when render throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = mockCache();
    const env = envWithAssets(pngResponse("static-og"));
    const res = await route("/og/bill/119-hr-1.png", {
      env,
      cache,
      render: async () => {
        throw new Error("satori boom");
      },
    });
    expect(res.headers.get("x-og-card")).toBe("fallback");
    expect(await res.text()).toBe("static-og");
    expect(errorSpy).toHaveBeenCalledWith("og_image_render_failed", expect.any(Error));
    expect(cache.put).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("renders, sets cache headers, and stores via waitUntil", async () => {
    const cache = mockCache();
    const waitUntil = vi.fn((p: Promise<unknown>) => p);
    const loadModel = vi.fn(
      async (
        _env: Env,
        bill: { congress: number; type: string; number: number },
        quoteId: string | null
      ): Promise<LoadOgCardModelResult> => {
        expect(bill).toEqual({ congress: 119, type: "HR", number: 1 });
        expect(quoteId).toBe("deadbeefdeadbeef");
        return { ok: true, model: CARD };
      }
    );
    const render = vi.fn(async (html: string) => {
      expect(html).toContain("TRACK CONGRESS");
      expect(html).toContain("House passes a permitting package");
      return pngResponse("rendered-png");
    });

    const res = await route("/og/bill/119-hr-1.png?quote=deadbeefdeadbeef&v=ver1", {
      cache,
      ctx: { waitUntil },
      loadModel,
      render,
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("rendered-png");
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(OG_IMAGE_CACHE_CONTROL);
    expect(res.headers.get("x-og-card")).toBe("rendered");
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]![0];
    expect(cache.put).toHaveBeenCalledTimes(1);
    const putReq = cache.put.mock.calls[0]![0] as Request;
    expect(putReq.url).toContain("quote=deadbeefdeadbeef");
    expect(putReq.url).toContain(`v=${ogCardVersion(CARD)}`);
    expect(putReq.url).not.toContain("ver1");
  });

  it("treats an invalid q as absent", async () => {
    const loadModel = vi.fn(
      async (
        _env: Env,
        _bill: { congress: number; type: string; number: number },
        quoteId: string | null
      ): Promise<LoadOgCardModelResult> => {
        expect(quoteId).toBeNull();
        return { ok: true, model: CARD };
      }
    );
    await route("/og/bill/119-hr-1.png?quote=NOT-HEX", {
      cache: mockCache(),
      loadModel,
    });
    expect(loadModel).toHaveBeenCalled();
  });

  it("awaits cache.put when ctx is omitted", async () => {
    const cache = mockCache();
    await route("/og/bill/119-hr-1.png", { cache });
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("returns a 1×1 PNG when ASSETS is missing", async () => {
    const res = await route("/og/bill/119-hr-1.png", {
      env: envWithAssets(null),
      cache: mockCache(),
      loadModel: async () => ({ ok: false, reason: "quote_not_found" }),
    });
    expect(res.headers.get("x-og-card")).toBe("fallback");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });
});
