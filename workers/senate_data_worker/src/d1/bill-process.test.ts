import { beforeEach, describe, expect, it, vi } from "vitest";

import { persistBillProcess, selectProcessQueueBatch } from "./bill-process";
import { resetSchemaFlag } from "./schema";

function createMockDb(options?: {
  allResults?: Array<{ congress: number; bill_type: string; bill_number: number }>;
}) {
  const binds: unknown[][] = [];
  const batch = vi.fn(async () => ({ results: [] }));
  const prepare = vi.fn((sql: string) => {
    const state = {
      bind: (...args: unknown[]) => {
        if (sql.includes("FROM process_refresh_queue")) binds.push(args);
        return state;
      },
      run: async () => ({ success: true }),
      first: async () => ({ version: 5 }),
      all: async () => ({ results: options?.allResults ?? [] }),
      sql,
    };
    return state;
  });
  return {
    db: { prepare, batch } as unknown as D1Database,
    prepare,
    batch,
    binds,
  };
}

describe("persistBillProcess", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("does not wipe stored events when a hydrate returns an empty list", async () => {
    const { db, prepare, batch } = createMockDb();
    await persistBillProcess(db, {
      congress: 119,
      billType: "HR",
      billNumber: 7008,
      events: [],
      state: {
        congress: 119,
        billType: "HR",
        billNumber: 7008,
        originChamber: null,
        currentStatus: "introduced",
        currentLabel: null,
        lastAdvanceAt: null,
      },
    });

    expect(batch).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("selectProcessQueueBatch", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("includes stale hydrations past the rehydrate window", async () => {
    const { db, binds } = createMockDb({
      allResults: [{ congress: 119, bill_type: "HR", bill_number: 1 }],
    });

    const rows = await selectProcessQueueBatch(db, 10);
    expect(rows).toEqual([{ congress: 119, billType: "HR", billNumber: 1 }]);
    expect(binds.some((args) => typeof args[0] === "string" && args[1] === 10)).toBe(
      true
    );
  });
});
