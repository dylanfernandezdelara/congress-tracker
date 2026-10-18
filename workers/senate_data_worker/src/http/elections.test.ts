import { describe, expect, it } from "vitest";

import type {
  ElectionsIndexResponse,
  ElectionsLocateResponse,
} from "../../../../shared/elections-2026/api-types";
import { handlePublicFetch } from "./router";
import { createMockEnv } from "./test-fixtures";

function get(path: string, cf?: { country?: string; regionCode?: string }): Request {
  const request = new Request(`https://trackcongress.org${path}`);
  if (cf) Object.defineProperty(request, "cf", { value: cf });
  return request;
}

describe("elections routes", () => {
  it("lists every state and DC with its status", async () => {
    const response = await handlePublicFetch(get("/elections/2026/index.json"), createMockEnv() as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage");
    const body = (await response.json()) as ElectionsIndexResponse;
    expect(body.election_day).toBe("2026-11-03");
    expect(body.states).toHaveLength(51);
    expect(body.states.find((s) => s.code === "PA")).toMatchObject({ name: "Pennsylvania" });
  });

  it("serves one state's guide and 404s an unknown code", async () => {
    const ok = await handlePublicFetch(get("/elections/2026/state/pa.json"), createMockEnv() as never);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { state: string }).state).toBe("PA");

    const missing = await handlePublicFetch(get("/elections/2026/state/ZZ.json"), createMockEnv() as never);
    expect(missing.status).toBe(404);
  });

  it("guesses the state from Cloudflare geolocation, never cached", async () => {
    const response = await handlePublicFetch(
      get("/elections/2026/locate.json", { country: "US", regionCode: "PA" }),
      createMockEnv() as never
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await response.json()) as ElectionsLocateResponse).state).toBe("PA");
  });

  it("returns no state outside the US or without geolocation", async () => {
    for (const cf of [{ country: "CA", regionCode: "ON" }, undefined]) {
      const response = await handlePublicFetch(get("/elections/2026/locate.json", cf), createMockEnv() as never);
      expect(((await response.json()) as ElectionsLocateResponse).state).toBeNull();
    }
  });
});
