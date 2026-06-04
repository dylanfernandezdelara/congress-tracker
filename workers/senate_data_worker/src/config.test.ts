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

describe("parseConfig", () => {
  it("parses evidence limits with defaults", () => {
    const config = parseConfig(baseEnv());
    expect(config.evidence.maxBills).toBe(30);
    expect(config.evidence.billConcurrency).toBe(2);
    expect(config.evidence.endpointFanout).toBe(3);
  });

  it("marks replay mode from harness env", () => {
    const config = parseConfig(
      baseEnv({
        DATA_SOURCE: "replay",
        REPLAY_FIXTURE_SET: "canonical",
      })
    );
    expect(config.replayMode).toBe(true);
  });
});
