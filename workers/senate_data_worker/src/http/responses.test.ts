import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS } from "../../../../shared/security-headers";
import { buildCorsHeaders, buildJsonResponse, parseAllowedOrigins, securityHeaders } from "./responses";

describe("parseAllowedOrigins", () => {
  it("treats missing and blank as open (null → caller uses *)", () => {
    expect(parseAllowedOrigins(undefined)).toBeNull();
    expect(parseAllowedOrigins("   ")).toBeNull();
  });

  it("keeps wildcard", () => {
    expect(parseAllowedOrigins("*")).toBe("*");
  });

  it("splits comma or whitespace allowlists", () => {
    expect(parseAllowedOrigins("https://a.example,https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
    expect(parseAllowedOrigins("https://a.example https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("buildCorsHeaders", () => {
  it("reflects a matching Origin from a multi-origin allowlist", () => {
    const headers = buildCorsHeaders(
      {
        ALLOWED_ORIGIN: "https://trackcongress.org,https://www.trackcongress.org",
      },
      "https://www.trackcongress.org"
    ) as Record<string, string>;

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://www.trackcongress.org");
    expect(headers.Vary).toBe("Origin");
  });

  it("falls back to the first allowlisted origin when Origin is absent or unknown", () => {
    const env = {
      ALLOWED_ORIGIN: "https://trackcongress.org,https://www.trackcongress.org",
    };
    const noOrigin = buildCorsHeaders(env, null) as Record<string, string>;
    expect(noOrigin["Access-Control-Allow-Origin"]).toBe("https://trackcongress.org");

    const unknown = buildCorsHeaders(env, "https://evil.example") as Record<string, string>;
    expect(unknown["Access-Control-Allow-Origin"]).toBe("https://trackcongress.org");
  });

  it("allows any origin when ALLOWED_ORIGIN is *", () => {
    const headers = buildCorsHeaders({ ALLOWED_ORIGIN: "*" }, "https://anywhere.example") as Record<
      string,
      string
    >;
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers.Vary).toBeUndefined();
  });
});

describe("buildJsonResponse", () => {
  it("attaches security headers alongside CORS and content type", async () => {
    const response = buildJsonResponse({ ok: true }, { "Access-Control-Allow-Origin": "*" });
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      SECURITY_HEADERS["Strict-Transport-Security"]
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe(
      SECURITY_HEADERS["X-Content-Type-Options"]
    );
    expect(response.headers.get("Referrer-Policy")).toBe(SECURITY_HEADERS["Referrer-Policy"]);
    expect(response.headers.get("Content-Security-Policy")).toBe(
      SECURITY_HEADERS["Content-Security-Policy"]
    );
    expect(response.headers.get("Permissions-Policy")).toBe(SECURITY_HEADERS["Permissions-Policy"]);
    expect(securityHeaders).toEqual({ ...SECURITY_HEADERS });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
