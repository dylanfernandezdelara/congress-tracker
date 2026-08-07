import { beforeEach, describe, expect, it, vi } from "vitest";
import { billHasSponsors, replaceBillSponsors } from "./sponsors";
import { resetSchemaFlag } from "./schema";

function createMockDb(options?: { firstResult?: { ok: number } | null }) {
  const batch = vi.fn(async () => ({ results: [] }));
  const prepare = vi.fn((sql: string) => {
    const state = {
      bind: (..._args: unknown[]) => state,
      run: async () => ({ success: true }),
      first: async () => options?.firstResult ?? null,
      all: async () => ({ results: [] }),
      sql,
    };
    return state;
  });
  return {
    db: { prepare, batch } as unknown as D1Database,
    prepare,
    batch,
  };
}

describe("replaceBillSponsors", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("no-ops without deleting when sponsors is empty", async () => {
    const { db, prepare, batch } = createMockDb();
    await replaceBillSponsors(db, 119, "HR", 1, []);
    expect(prepare).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("batches delete + inserts for a non-empty sponsor list", async () => {
    const { db, batch } = createMockDb();
    await replaceBillSponsors(db, 119, "hr", 1, [
      {
        bioguideId: "G000555",
        state: "NY",
        fullName: "Rep. Example",
        party: "D",
        isPrimary: true,
      },
    ]);
    expect(batch).toHaveBeenCalledOnce();
    const [statements] = batch.mock.calls[0] as unknown as [unknown[]];
    expect(statements).toHaveLength(2);
  });
});

describe("billHasSponsors", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("queries only primary sponsors", async () => {
    const { db, prepare } = createMockDb({ firstResult: { ok: 1 } });
    const has = await billHasSponsors(db, 119, "HR", 1);
    expect(has).toBe(true);
    const sql = String(prepare.mock.calls.map((c) => c[0]).join("\n"));
    expect(sql).toContain("is_primary = 1");
  });
});
