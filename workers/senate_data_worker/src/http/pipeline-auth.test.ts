import { describe, expect, it } from "vitest";
import {
  authorizePipeline,
  isPreviewWorkerHost,
  isProductionPipelineHost,
  timingSafeEqual,
} from "./pipeline-auth";

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

describe("isProductionPipelineHost", () => {
  it("detects custom domains and bare workers.dev", () => {
    expect(isProductionPipelineHost("trackcongress.org")).toBe(true);
    expect(isProductionPipelineHost("www.trackcongress.org")).toBe(true);
    expect(isProductionPipelineHost("congress-tracker-api.fernandezdelaradylan.workers.dev")).toBe(
      true
    );
  });

  it("does not treat preview, local, or test hosts as production", () => {
    expect(isProductionPipelineHost("abc-congress-tracker-api.foo.workers.dev")).toBe(false);
    expect(isProductionPipelineHost("127.0.0.1")).toBe(false);
    expect(isProductionPipelineHost("localhost")).toBe(false);
    expect(isProductionPipelineHost("worker.example.com")).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("returns true for equal strings and false for unequal or different lengths", () => {
    expect(timingSafeEqual("s3cret", "s3cret")).toBe(true);
    expect(timingSafeEqual("s3cret", "s3crex")).toBe(false);
    expect(timingSafeEqual("short", "longer-token")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
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
        DEV_OPEN_PIPELINE: "1",
      })
    ).toBe(false);
  });

  it("allows local/test hosts with DEV_OPEN_PIPELINE=1 when no token is set", () => {
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

  it("rejects production hosts when DEV_OPEN_PIPELINE=1 leaks without a token", () => {
    const request = new Request("https://trackcongress.org/__pipeline/run/feed", {
      method: "POST",
    });
    expect(
      authorizePipeline(request, {
        ...baseEnv,
        DEV_OPEN_PIPELINE: "1",
      })
    ).toBe(false);
  });

  it("rejects wrong or missing bearer when PIPELINE_ADMIN_TOKEN is set", () => {
    const env = { ...baseEnv, PIPELINE_ADMIN_TOKEN: "s3cret" };
    expect(
      authorizePipeline(
        new Request("https://congress-tracker-api.foo.workers.dev/__pipeline/run/feed", {
          method: "POST",
        }),
        env
      )
    ).toBe(false);
    expect(
      authorizePipeline(
        new Request("https://congress-tracker-api.foo.workers.dev/__pipeline/run/feed", {
          method: "POST",
          headers: { Authorization: "Bearer wrong" },
        }),
        env
      )
    ).toBe(false);
    expect(
      authorizePipeline(
        new Request("https://congress-tracker-api.foo.workers.dev/__pipeline/run/feed", {
          method: "POST",
          headers: { Authorization: "Bearer s3cret" },
        }),
        env
      )
    ).toBe(true);
  });
});
