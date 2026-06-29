import { describe, expect, it } from "vitest";
import { sanitizePipelineErrorPublic } from "./pipeline-error";

describe("sanitizePipelineErrorPublic", () => {
  it("redacts api keys and query strings from URLs", () => {
    const sanitized = sanitizePipelineErrorPublic(
      'HTTP 403 for https://api.congress.gov/v3/bill/119/hr/1?format=json&api_key=supersecret'
    );
    expect(sanitized).not.toContain("supersecret");
    expect(sanitized).toContain("https://api.congress.gov/v3/bill/119/hr/1");
  });

  it("truncates very long messages", () => {
    const sanitized = sanitizePipelineErrorPublic("x".repeat(500));
    expect(sanitized.length).toBeLessThanOrEqual(200);
  });
});
