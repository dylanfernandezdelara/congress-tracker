import { describe, expect, it } from "vitest";

import { todayEastern } from "./date-parse";
import { buildHarnessConfig, createFixtureHttp, harnessNowDate } from "./harness";
import { fetchVoteMenu } from "./fetch";
import { parseVoteMenuXml } from "./xml";

const FIXTURE_ENV = { HARNESS_MODE: "fixture", HARNESS_FIXTURE_SET: "canonical" } as const;

describe("harness runtime", () => {
  it("pins the clock to the fixture instant", () => {
    const harness = buildHarnessConfig(FIXTURE_ENV);
    const now = harnessNowDate(harness);
    expect(now).not.toBeNull();
    expect(todayEastern(now ?? undefined)).toBe("2026-01-20");
  });

  it("resolves fixture URLs even when api_key is present", () => {
    const fixtureHttp = createFixtureHttp(buildHarnessConfig(FIXTURE_ENV));
    expect(fixtureHttp.enabled).toBe(true);
    const fixture = fixtureHttp.resolve(
      "https://www.govinfo.gov/content/pkg/CREC-2026-01-17/txt/CREC-2026-01-17-pt1-PgS123.txt?api_key=test-key"
    );

    expect(fixture).not.toBeNull();
    expect(fixture?.body).toContain("Border Infrastructure Modernization Act");
  });

  it("serves vote menu XML through the normal fetch helper", async () => {
    const fixture = createFixtureHttp(buildHarnessConfig(FIXTURE_ENV));
    const result = await fetchVoteMenu(119, 2, { fixture });

    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(parseVoteMenuXml(result.data ?? "")).toHaveLength(3);
  });

  it("is disabled in live mode", () => {
    const fixtureHttp = createFixtureHttp(buildHarnessConfig({ HARNESS_MODE: "live" }));
    expect(fixtureHttp.enabled).toBe(false);
    expect(fixtureHttp.resolve("https://example.com")).toBeNull();
  });
});
