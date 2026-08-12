import { describe, expect, it, vi } from "vitest";

import { persistBillProcess } from "./bill-process";

describe("persistBillProcess", () => {
  it("does not wipe stored events when a hydrate returns an empty list", async () => {
    const batch = vi.fn(async () => []);
    const prepare = vi.fn(() => ({
      bind: () => ({ run: async () => ({ success: true }) }),
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
      first: async () => null,
    }));
    const db = { prepare, batch } as unknown as D1Database;

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
