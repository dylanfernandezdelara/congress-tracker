import { describe, expect, it } from "vitest";
import { authorizePipeline, isPreviewWorkerHost } from "./pipeline-auth";

describe("isPreviewWorkerHost", () => {
  it("detects version preview hostnames", () => {
    expect(isPreviewWorkerHost("abc123-congress-tracker-api.foo.workers.dev")).toBe(true);
    expect(isPreviewWorkerHost("my-branch-congress-tracker-api.foo.workers.dev")).toBe(true);
  });

  it("does not treat production hostname as preview", () => {
    expect(isPreviewWorkerHost("congress-tracker-api.foo.workers.dev")).toBe(false);
    expect(isPreviewWorkerHost("worker.example.com")).toBe(false);
    expect(isPreviewWorkerHost("127.0.0.1")).toBe(false);
  });
});

describe("authorizePipeline", () => {
  const baseEnv = {
    DB: {} as D1Database,
    CONGRESS: "119",
    SESSION: "2",
    CONGRESS_API_KEY: "key",
    OPENROUTER_API_KEY: "or",
  };

  it("blocks pipeline writes on preview hosts even with a valid token", () => {
    const request = new Request(
      "https://abc123-congress-tracker-api.foo.workers.dev/__pipeline/run/feed",
      {
        method: "POST",
        headers: { Authorization: "Bearer s3cret" },
      }
    );
    expect(
      authorizePipeline(request, {
        ...baseEnv,
        PIPELINE_ADMIN_TOKEN: "s3cret",
      })
    ).toBe(false);
  });

  it("allows local dev pipelines on non-preview hosts", () => {
    const request = new Request("https://worker.example.com/__pipeline/run/feed", {
      method: "POST",
    });
    expect(
      authorizePipeline(request, {
        ...baseEnv,
        DEV_OPEN_PIPELINE: "1",
      })
    ).toBe(true);
  });
});
