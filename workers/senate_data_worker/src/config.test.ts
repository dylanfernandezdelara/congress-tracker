import { describe, expect, it } from "vitest";

import { parseBool, parseConfig, type Env } from "./config";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    SENATE_DB: {} as D1Database,
    CONGRESS: "119",
    SESSION: "2",
    TARGET_STATE: "ALL",
    CONGRESS_API_KEY: "test-congress-key",
    GOVINFO_API_KEY: "test-govinfo-key",
    ...overrides,
  };
}

describe("parseBool", () => {
  it("treats on/off as true/false", () => {
    expect(parseBool("on", false)).toBe(true);
    expect(parseBool("ON", false)).toBe(true);
    expect(parseBool("off", true)).toBe(false);
    expect(parseBool("OFF", true)).toBe(false);
  });
});

describe("parseConfig synthesis", () => {
  it("enables synthesis when SYNTHESIS=on, api key present, and not replay", () => {
    const config = parseConfig(
      baseEnv({
        SYNTHESIS: "on",
        OPENROUTER_API_KEY: "test-openrouter-key",
      })
    );
    expect(config.synthesis.enabled).toBe(true);
    expect(config.synthesis.maxNewAnalyses).toBe(20);
    expect(config.synthesis.apiKey).toBe("test-openrouter-key");
  });

  it("keeps synthesis disabled when SYNTHESIS is unset or off", () => {
    expect(parseConfig(baseEnv()).synthesis.enabled).toBe(false);
    expect(parseConfig(baseEnv({ SYNTHESIS: "off" })).synthesis.enabled).toBe(false);
    expect(
      parseConfig(
        baseEnv({
          SYNTHESIS: "off",
          OPENROUTER_API_KEY: "test-openrouter-key",
        })
      ).synthesis.enabled
    ).toBe(false);
  });

  it("forces synthesis off in replay mode even with SYNTHESIS=on and api key", () => {
    const config = parseConfig(
      baseEnv({
        DATA_SOURCE: "replay",
        REPLAY_FIXTURE_SET: "canonical",
        SYNTHESIS: "on",
        OPENROUTER_API_KEY: "test-openrouter-key",
      })
    );
    expect(config.replayMode).toBe(true);
    expect(config.synthesis.enabled).toBe(false);
  });
});
