import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSchemaFlag } from "../d1/schema";
import { handlePublicFetch } from "./router";
import {
  createMockEnv,
  createPipelineStateMockDb,
  pipelineRequest,
  VALID_SENATE_VOTE_MENU_XML,
} from "./test-fixtures";

const mockWithPipelineLease = vi.fn(
  async <T>(_db: D1Database, fn: () => Promise<T>, _options?: unknown) => fn()
);

vi.mock("../d1/pipeline-lease", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/pipeline-lease")>();
  return {
    ...actual,
    withPipelineLease: <T>(
      db: D1Database,
      fn: () => Promise<T>,
      options?: Parameters<typeof actual.withPipelineLease>[2]
    ) => mockWithPipelineLease(db, fn, options),
  };
});

describe("POST /__pipeline/senate-vote-menu", () => {
  beforeEach(() => {
    resetSchemaFlag();
    mockWithPipelineLease.mockClear();
  });

  it("caches admin-uploaded Senate vote menu XML", async () => {
    const db = createPipelineStateMockDb();
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/senate-vote-menu", {
        headers: { "Content-Type": "application/xml" },
        body: VALID_SENATE_VOTE_MENU_XML,
      }),
      createMockEnv({ DB: db }) as never
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      congress: number;
      session: number;
      fetched_at: string;
      run_feed: boolean;
    };
    expect(body).toMatchObject({
      ok: true,
      congress: 119,
      session: 2,
      run_feed: false,
    });
    expect(body.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const row = await db
      .prepare(`SELECT value_json FROM pipeline_state WHERE key = ?1`)
      .bind("senate_vote_menu_cache_119_2")
      .first<{ value_json: string }>();
    expect(row?.value_json).toContain("00217");
  });

  it("rejects invalid Senate vote menu uploads", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/senate-vote-menu", {
        headers: { "Content-Type": "text/plain" },
        body: "<html>not a menu</html>",
      }),
      createMockEnv() as never
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "invalid_senate_vote_menu",
    });
  });

  it("rejects menus for the wrong congress/session", async () => {
    const xml = VALID_SENATE_VOTE_MENU_XML.replace(
      "<congress>119</congress>",
      "<congress>118</congress>"
    );
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/senate-vote-menu", {
        headers: { "Content-Type": "application/xml" },
        body: xml,
      }),
      createMockEnv() as never
    );
    expect(response.status).toBe(400);
  });

  it("rejects GET before body validation", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/__pipeline/senate-vote-menu", {
        method: "GET",
      }),
      createMockEnv() as never
    );
    expect(response.status).toBe(405);
  });

  it("rejects unauthenticated posts before body validation", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/senate-vote-menu", {
        headers: { "Content-Type": "text/plain" },
        body: "not xml",
      }),
      createMockEnv({
        DEV_OPEN_PIPELINE: undefined,
        PIPELINE_ADMIN_TOKEN: "s3cret",
      }) as never
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });
});
