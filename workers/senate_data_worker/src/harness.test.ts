import { afterEach, describe, expect, it } from "vitest";

import { todayEastern } from "./date-parse";
import {
  applyHarnessEnv,
  resetHarnessRuntime,
  resolveHarnessFixtureResponse,
} from "./harness";
import { fetchVoteMenu } from "./fetch";
import { parseVoteMenuXml } from "./xml";

describe("harness runtime", () => {
  afterEach(() => {
    resetHarnessRuntime();
  });

  it("overrides todayEastern in fixture mode", () => {
    applyHarnessEnv({ HARNESS_MODE: "fixture", HARNESS_FIXTURE_SET: "canonical" });
    expect(todayEastern()).toBe("2026-01-20");
  });

  it("resolves fixture URLs even when api_key is present", () => {
    applyHarnessEnv({ HARNESS_MODE: "fixture", HARNESS_FIXTURE_SET: "canonical" });
    const fixture = resolveHarnessFixtureResponse(
      "https://www.govinfo.gov/content/pkg/CREC-2026-01-17/txt/CREC-2026-01-17-pt1-PgS123.txt?api_key=test-key"
    );

    expect(fixture).not.toBeNull();
    expect(fixture?.body).toContain("Border Infrastructure Modernization Act");
  });

  it("serves vote menu XML through the normal fetch helper", async () => {
    applyHarnessEnv({ HARNESS_MODE: "fixture", HARNESS_FIXTURE_SET: "canonical" });
    const result = await fetchVoteMenu(119, 2);

    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(parseVoteMenuXml(result.data ?? "")).toHaveLength(3);
  });
});
