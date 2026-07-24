import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PipelineBusyError,
  acquirePipelineLease,
  releasePipelineLease,
  withPipelineLease,
} from "./pipeline-lease";
import { resetSchemaFlag } from "./schema";

type StoreRow = { value_json: string; updated_at: string };

function createLeaseMockDb() {
  const store = new Map<string, StoreRow>();
  const db = {
    prepare(sql: string) {
      const state = {
        args: [] as unknown[],
        bind: (...args: unknown[]) => {
          state.args = args;
          return state;
        },
        first: async () => {
          if (sql.includes("FROM pipeline_state") && sql.includes("WHERE key")) {
            const key = String(state.args[0]);
            const row = store.get(key);
            return row ? { value_json: row.value_json } : null;
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.includes("INSERT INTO pipeline_state") && sql.includes("ON CONFLICT")) {
            const key = String(state.args[0]);
            const valueJson = String(state.args[1]);
            const updatedAt = String(state.args[2]);
            const nowIso = String(state.args[3] ?? updatedAt);
            const existing = store.get(key);
            if (!existing) {
              store.set(key, { value_json: valueJson, updated_at: updatedAt });
              return { success: true, meta: { changes: 1, duration: 0 } };
            }
            let expiresAt: string | null = null;
            try {
              const parsed = JSON.parse(existing.value_json) as { expires_at?: string };
              expiresAt = parsed.expires_at ?? null;
            } catch {
              expiresAt = null;
            }
            const canTake = expiresAt === null || expiresAt <= nowIso;
            if (!canTake) {
              return { success: true, meta: { changes: 0, duration: 0 } };
            }
            store.set(key, { value_json: valueJson, updated_at: updatedAt });
            return { success: true, meta: { changes: 1, duration: 0 } };
          }
          if (sql.includes("DELETE FROM pipeline_state")) {
            const key = String(state.args[0]);
            const holder = String(state.args[1]);
            const existing = store.get(key);
            if (!existing) {
              return { success: true, meta: { changes: 0, duration: 0 } };
            }
            try {
              const parsed = JSON.parse(existing.value_json) as { holder?: string };
              if (parsed.holder === holder) {
                store.delete(key);
                return { success: true, meta: { changes: 1, duration: 0 } };
              }
            } catch {
              /* ignore */
            }
            return { success: true, meta: { changes: 0, duration: 0 } };
          }
          // Schema DDL / other writes
          if (sql.includes("INSERT INTO pipeline_state")) {
            const key = String(state.args[0]);
            const valueJson = String(state.args[1]);
            const updatedAt = String(state.args[2]);
            store.set(key, { value_json: valueJson, updated_at: updatedAt });
          }
          return { success: true, meta: { changes: 1, duration: 0 } };
        },
      };
      return state;
    },
  } as unknown as D1Database;

  return { db, store };
}

describe("pipeline lease", () => {
  beforeEach(() => {
    resetSchemaFlag();
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("holder-a")
        .mockReturnValueOnce("holder-b")
        .mockReturnValueOnce("holder-c")
        .mockReturnValue("holder-x"),
    });
  });

  it("acquires a free lease", async () => {
    const { db, store } = createLeaseMockDb();
    const holder = await acquirePipelineLease(db, "writes", 60_000, new Date("2026-07-01T00:00:00.000Z"));
    expect(holder).toBe("holder-a");
    expect(store.get("pipeline_lease:writes")?.value_json).toContain("holder-a");
  });

  it("rejects a second acquire while the lease is held", async () => {
    const { db } = createLeaseMockDb();
    const now = new Date("2026-07-01T00:00:00.000Z");
    const first = await acquirePipelineLease(db, "writes", 60_000, now);
    expect(first).toBe("holder-a");
    const second = await acquirePipelineLease(db, "writes", 60_000, now);
    expect(second).toBeNull();
  });

  it("allows acquire after expiry", async () => {
    const { db } = createLeaseMockDb();
    const first = await acquirePipelineLease(
      db,
      "writes",
      60_000,
      new Date("2026-07-01T00:00:00.000Z")
    );
    expect(first).toBe("holder-a");
    const second = await acquirePipelineLease(
      db,
      "writes",
      60_000,
      new Date("2026-07-01T00:02:00.000Z")
    );
    expect(second).toBe("holder-b");
  });

  it("allows acquire at the exact expiry instant", async () => {
    const { db } = createLeaseMockDb();
    const first = await acquirePipelineLease(
      db,
      "writes",
      60_000,
      new Date("2026-07-01T00:00:00.000Z")
    );
    expect(first).toBe("holder-a");
    const second = await acquirePipelineLease(
      db,
      "writes",
      60_000,
      new Date("2026-07-01T00:01:00.000Z")
    );
    expect(second).toBe("holder-b");
  });

  it("still surfaces the pipeline error when release fails", async () => {
    const { db } = createLeaseMockDb();
    const originalPrepare = db.prepare.bind(db);
    let deleteCalls = 0;
    vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      const stmt = originalPrepare(sql);
      if (sql.includes("DELETE FROM pipeline_state")) {
        deleteCalls += 1;
        return {
          bind: () => ({
            run: async () => {
              throw new Error("d1_release_failed");
            },
          }),
        } as unknown as ReturnType<D1Database["prepare"]>;
      }
      return stmt;
    });

    await expect(
      withPipelineLease(
        db,
        async () => {
          throw new Error("boom");
        },
        { now: new Date("2026-07-01T00:00:00.000Z") }
      )
    ).rejects.toThrow("boom");
    expect(deleteCalls).toBe(1);
  });

  it("releases on error via withPipelineLease", async () => {
    const { db, store } = createLeaseMockDb();
    await expect(
      withPipelineLease(
        db,
        async () => {
          throw new Error("boom");
        },
        { now: new Date("2026-07-01T00:00:00.000Z") }
      )
    ).rejects.toThrow("boom");
    expect(store.has("pipeline_lease:writes")).toBe(false);

    const holder = await acquirePipelineLease(
      db,
      "writes",
      60_000,
      new Date("2026-07-01T00:00:00.000Z")
    );
    expect(holder).toBe("holder-b");
  });

  it("throws PipelineBusyError when lease is held", async () => {
    const { db } = createLeaseMockDb();
    const now = new Date("2026-07-01T00:00:00.000Z");
    await acquirePipelineLease(db, "writes", 60_000, now);
    await expect(withPipelineLease(db, async () => "ok", { now })).rejects.toBeInstanceOf(
      PipelineBusyError
    );
  });

  it("release is a no-op for a different holder", async () => {
    const { db, store } = createLeaseMockDb();
    const holder = await acquirePipelineLease(
      db,
      "writes",
      60_000,
      new Date("2026-07-01T00:00:00.000Z")
    );
    expect(holder).toBe("holder-a");
    await releasePipelineLease(db, "writes", "someone-else");
    expect(store.has("pipeline_lease:writes")).toBe(true);
  });
});
