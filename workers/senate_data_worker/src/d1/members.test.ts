import { describe, expect, it } from "vitest";
import { getMembersByIds } from "./members";
import { resetSchemaFlag } from "./schema";

/**
 * Records bound-parameter counts per member lookup so we can assert no single
 * query exceeds D1's 100-bound-parameter limit.
 */
function createRecordingDb(boundCounts: number[]): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        if (sql.includes("FROM members WHERE bioguide_id IN")) {
          boundCounts.push(args.length);
        }
        return {
          all: async () => ({
            results: args.map((id) => ({
              bioguide_id: id as string,
              name: `Member ${id}`,
              chamber: "House",
              party: "D",
              state: "CA",
              district: 1,
            })),
          }),
          run: async () => ({ success: true }),
        };
      },
      run: async () => ({ success: true }),
    }),
  } as unknown as D1Database;
}

describe("getMembersByIds", () => {
  it("chunks lookups so no query exceeds the 100-bound-parameter limit", async () => {
    resetSchemaFlag();
    const boundCounts: number[] = [];
    const db = createRecordingDb(boundCounts);
    const ids = Array.from({ length: 435 }, (_, i) => `H${i}`);

    const map = await getMembersByIds(db, ids);

    expect(map.size).toBe(435);
    expect(boundCounts.length).toBeGreaterThan(1);
    for (const count of boundCounts) {
      expect(count).toBeLessThanOrEqual(100);
    }
  });
});
