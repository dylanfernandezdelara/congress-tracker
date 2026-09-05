import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { SECURITY_HEADERS } from "../../../../shared/security-headers";
import { createMockEnv } from "./test-fixtures";
import {
  acceptPrefersHtml,
  BILL_OG_CACHE_CONTROL,
  escapeHtmlAttr,
  isBillOgDocumentRequest,
  ogFieldsFromDigest,
  PRODUCTION_ORIGIN,
  rewriteShareMeta,
  tryRewriteBillOg,
} from "./bill-og";
import type { DigestRow } from "../d1/digests";

const SITE_HTML = readFileSync(
  path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../web/index.html"),
  "utf8"
);

function digestRow(overrides: Partial<DigestRow> = {}): DigestRow {
  return {
    congress: 119,
    bill_type: "HR",
    number: 4795,
    title: "A title-only intro",
    policy_area: null,
    raw_summary_text: null,
    digest_json: JSON.stringify({
      headline: "House passes a permitting package",
      what_it_does: "Speeds energy permits and production.",
      key_points: ["One"],
      terms_explained: [],
    }),
    ...overrides,
  };
}

function digestDb(row: DigestRow | null): D1Database {
  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(async () => row),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => ({ success: true, meta: { duration: 0, changes: 0 } })),
    })),
  } as unknown as D1Database;
}

describe("bill OG rewrite", () => {
  it("treats HTML and empty Accept as document navigations", () => {
    expect(acceptPrefersHtml("text/html,application/xhtml+xml")).toBe(true);
    expect(acceptPrefersHtml("*/*")).toBe(true);
    expect(acceptPrefersHtml(null)).toBe(true);
    expect(acceptPrefersHtml("application/json")).toBe(false);
  });

  it("only rewrites GET SPA shell requests that include bill=", () => {
    const htmlGet = new Request("https://worker.example.com/?bill=119-hr-1", {
      headers: { Accept: "text/html" },
    });
    expect(isBillOgDocumentRequest(htmlGet, new URL(htmlGet.url))).toBe(true);

    const asset = new Request("https://worker.example.com/assets/index.js", {
      headers: { Accept: "text/html" },
    });
    expect(isBillOgDocumentRequest(asset, new URL(asset.url))).toBe(false);

    const home = new Request("https://worker.example.com/", {
      headers: { Accept: "text/html" },
    });
    expect(isBillOgDocumentRequest(home, new URL(home.url))).toBe(false);
  });

  it("escapes HTML attribute values", () => {
    expect(escapeHtmlAttr(`Energy & "jobs" <act>`)).toBe(
      "Energy &amp; &quot;jobs&quot; &lt;act&gt;"
    );
  });

  it("rewrites the production SPA shell including the document title", () => {
    const html = rewriteShareMeta(SITE_HTML, {
      title: 'Permitting & "jobs"',
      description: "Speeds energy permits.",
      url: `${PRODUCTION_ORIGIN}/?bill=119-hr-4795`,
    });
    expect(html).toContain('property="og:title" content="Permitting &amp; &quot;jobs&quot;"');
    expect(html).toContain('property="og:description" content="Speeds energy permits."');
    expect(html).toContain(`property="og:url" content="${PRODUCTION_ORIGIN}/?bill=119-hr-4795"`);
    expect(html).toContain('name="twitter:title" content="Permitting &amp; &quot;jobs&quot;"');
    expect(html).toContain('name="twitter:description" content="Speeds energy permits."');
    expect(html).toContain('rel="canonical" href="https://trackcongress.org/?bill=119-hr-4795"');
    expect(html).toContain("<title>Permitting &amp; &quot;jobs&quot;</title>");
    expect(html).toContain('property="og:image" content="https://trackcongress.org/og-image.png"');
    expect(html).not.toContain('property="og:title" content="Track Congress"');
    expect(html).not.toContain("<title>Track Congress</title>");
  });

  it("throws when the shell is missing a share tag", () => {
    expect(() =>
      rewriteShareMeta("<html><head></head></html>", {
        title: "Energy",
        description: "Permits",
        url: `${PRODUCTION_ORIGIN}/?bill=119-hr-1`,
      })
    ).toThrow(/missed tags/);
  });

  it("builds OG fields from digest or title-only fallbacks", () => {
    expect(ogFieldsFromDigest(digestRow(), { congress: 119, type: "HR", number: 4795 })).toEqual({
      title: "House passes a permitting package",
      description: "Speeds energy permits and production.",
      url: `${PRODUCTION_ORIGIN}/?bill=119-hr-4795`,
    });
    expect(
      ogFieldsFromDigest(digestRow({ digest_json: null }), {
        congress: 119,
        type: "HR",
        number: 4795,
      })
    ).toMatchObject({
      title: "A title-only intro",
      description: "A title-only intro",
    });
    expect(ogFieldsFromDigest(null, { congress: 119, type: "HR", number: 1 })).toBeNull();
  });

  it("rewrites the SPA shell when a digest exists", async () => {
    const ASSETS = {
      fetch: vi.fn(async () => new Response(SITE_HTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex",
        },
      })),
    };
    const env = createMockEnv({
      ASSETS,
      DB: digestDb(digestRow()),
    });
    const response = await tryRewriteBillOg(
      new Request("https://worker.example.com/?bill=119-hr-4795", {
        headers: { Accept: "text/html" },
      }),
      env as never
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain('property="og:title" content="House passes a permitting package"');
    expect(html).toContain('property="og:description" content="Speeds energy permits and production."');
    expect(response!.headers.get("cache-control")).toBe(BILL_OG_CACHE_CONTROL);
    expect(response!.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response!.headers.get("Content-Security-Policy")).toBe(
      SECURITY_HEADERS["Content-Security-Policy"]
    );
    expect(response!.headers.get("X-Content-Type-Options")).toBe(
      SECURITY_HEADERS["X-Content-Type-Options"]
    );
    expect(ASSETS.fetch).toHaveBeenCalledOnce();
  });

  it("falls back to the static shell when the digest is missing", async () => {
    const shell = new Response(SITE_HTML, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const ASSETS = { fetch: vi.fn(async () => shell) };
    const env = createMockEnv({ ASSETS, DB: digestDb(null) });
    const response = await tryRewriteBillOg(
      new Request("https://worker.example.com/?bill=119-hr-9999", {
        headers: { Accept: "text/html" },
      }),
      env as never
    );
    expect(response).toBe(shell);
    const html = await response!.text();
    expect(html).toContain('property="og:title" content="Track Congress"');
  });

  it("does not intercept non-document or non-bill requests", async () => {
    const env = createMockEnv({ ASSETS: { fetch: vi.fn() } });
    await expect(
      tryRewriteBillOg(new Request("https://worker.example.com/"), env as never)
    ).resolves.toBeNull();
    await expect(
      tryRewriteBillOg(
        new Request("https://worker.example.com/?bill=119-hr-1", {
          headers: { Accept: "application/json" },
        }),
        env as never
      )
    ).resolves.toBeNull();
  });
});
