import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSchemaFlag } from "../d1/schema";
import { handlePublicFetch } from "./router";

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

/** In-memory D1 that persists `pipeline_state` rows. */
function createPipelineStateMockDb(): D1Database {
  const store = new Map<string, { value_json: string; updated_at: string }>();
  const runResult = { success: true, meta: { duration: 0, changes: 1 } };

  type Stmt = {
    sql: string;
    args: unknown[];
    bind: (...args: unknown[]) => Stmt;
    all: () => Promise<{ results: unknown[] }>;
    first: () => Promise<unknown>;
    run: () => Promise<typeof runResult>;
  };

  function applyUpsert(sql: string, args: unknown[]) {
    if (sql.includes("INSERT INTO pipeline_state")) {
      const [key, valueJson, updatedAt] = args;
      store.set(String(key), {
        value_json: String(valueJson),
        updated_at: String(updatedAt),
      });
    }
  }

  return {
    exec: vi.fn(async () => {}),
    prepare(sql: string) {
      const state: Stmt = {
        sql,
        args: [] as unknown[],
        bind: vi.fn((...args: unknown[]) => {
          state.args = args;
          return state;
        }),
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => {
          if (sql.includes("FROM pipeline_state") && sql.includes("WHERE key")) {
            const row = store.get(String(state.args[0]));
            return row ? { value_json: row.value_json } : null;
          }
          return null;
        }),
        run: vi.fn(async () => {
          applyUpsert(sql, state.args);
          return runResult;
        }),
      };
      return state;
    },
    batch: vi.fn(async (statements: Stmt[]) => {
      for (const stmt of statements) {
        applyUpsert(stmt.sql, stmt.args);
      }
      return statements.map(() => runResult);
    }),
  } as unknown as D1Database;
}

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: createPipelineStateMockDb(),
    CONGRESS: "119",
    SESSION: "2",
    CONGRESS_API_KEY: "test-key",
    OPENROUTER_API_KEY: "test-or",
    ALLOWED_ORIGIN: "*",
    DEV_OPEN_PIPELINE: "1",
    ...overrides,
  };
}

function pipelineRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://worker.example.com${path}`, {
    method: "POST",
    ...init,
  });
}

const VALID_MENU = `<?xml version="1.0"?><vote_summary>
  <congress>119</congress>
  <session>2</session>
  <votes><vote><vote_number>00217</vote_number></vote></votes>
</vote_summary>`;

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
        body: VALID_MENU,
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
    const xml = VALID_MENU.replace("<congress>119</congress>", "<congress>118</congress>");
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/senate-vote-menu", {
        headers: { "Content-Type": "application/xml" },
        body: xml,
      }),
      createMockEnv() as never
    );
    expect(response.status).toBe(400);
  });
});
