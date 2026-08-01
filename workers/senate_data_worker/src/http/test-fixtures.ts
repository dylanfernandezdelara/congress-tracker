import { vi } from "vitest";

/** Minimal in-memory D1 that ignores writes (empty query results). */
export function createMockDb(): D1Database {
  const runResult = { success: true, meta: { duration: 0, changes: 1 } };
  const stmt = () => ({
    bind: vi.fn(() => stmt()),
    all: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
    run: vi.fn(async () => runResult),
  });
  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn(() => stmt()),
  } as unknown as D1Database;
}

/** In-memory D1 that persists `pipeline_state` rows for ingest/admin tests. */
export function createPipelineStateMockDb(): D1Database {
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
          if (sql.includes("MAX(vote_date)")) {
            return { latest_passage_vote_date: null };
          }
          if (sql.includes("missing_count")) {
            return { missing_count: 0 };
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

export function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: createMockDb(),
    CONGRESS: "119",
    SESSION: "2",
    CONGRESS_API_KEY: "test-key",
    OPENROUTER_API_KEY: "test-or",
    ALLOWED_ORIGIN: "*",
    DEV_OPEN_PIPELINE: "1",
    ...overrides,
  };
}

export function pipelineRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://worker.example.com${path}`, {
    method: "POST",
    ...init,
  });
}

/** Minimal valid Senate LIS menu for admin-route tests (119th / session 2). */
export const VALID_SENATE_VOTE_MENU_XML = `<?xml version="1.0"?><vote_summary>
  <congress>119</congress>
  <session>2</session>
  <votes><vote><vote_number>00217</vote_number></vote></votes>
</vote_summary>`;
