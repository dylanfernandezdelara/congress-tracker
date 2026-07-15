import { beforeEach, describe, expect, it } from "vitest";
import { resetSchemaFlag } from "./schema";
import {
  getLifecycle,
  getLifecyclesForBills,
  lifecycleMapKey,
  upsertLifecycle,
} from "./lifecycle";

function createMockDb(): {
  db: D1Database;
  upsertBinds: unknown[][];
  selectResults: Map<string, Record<string, unknown>>;
} {
  const upsertBinds: unknown[][] = [];
  const selectResults = new Map<string, Record<string, unknown>>();

  const db = {
    prepare: (sql: string) => {
      if (sql.startsWith("CREATE") || sql.startsWith("DELETE") || sql.startsWith("CREATE UNIQUE")) {
        return {
          bind: () => ({ run: async () => ({ success: true }) }),
          run: async () => ({ success: true }),
        };
      }

      if (sql.includes("INSERT INTO bill_lifecycle")) {
        return {
          bind: (...args: unknown[]) => ({
            run: async () => {
              upsertBinds.push(args);
              const [congress, billType, billNumber] = args;
              const key = `${congress}:${billType}:${billNumber}`;
              selectResults.set(key, {
                congress,
                bill_type: billType,
                bill_number: billNumber,
                introduced_date: args[3],
                presented_date: args[4],
                signed_date: args[5],
                vetoed_date: args[6],
                became_law_date: args[7],
                law_kind: args[8],
                public_law: args[9],
                latest_action_date: args[10],
                latest_action_text: args[11],
                updated_at: args[12],
              });
              return { success: true };
            },
          }),
        };
      }

      if (sql.includes("FROM bill_lifecycle") && sql.includes("WHERE congress = ? AND UPPER(bill_type)")) {
        return {
          bind: (congress: number, billType: string, billNumber: number) => ({
            first: async () => {
              return selectResults.get(`${congress}:${billType}:${billNumber}`) ?? null;
            },
            all: async () => {
              const row = selectResults.get(`${congress}:${billType}:${billNumber}`);
              return { results: row ? [row] : [] };
            },
          }),
        };
      }

      if (sql.includes("FROM bill_lifecycle") && sql.includes(" OR ")) {
        return {
          bind: (...args: unknown[]) => ({
            all: async () => {
              const results: Record<string, unknown>[] = [];
              for (let i = 0; i < args.length; i += 3) {
                const key = `${args[i]}:${args[i + 1]}:${args[i + 2]}`;
                const row = selectResults.get(key);
                if (row) results.push(row);
              }
              return { results };
            },
          }),
        };
      }

      return {
        bind: () => ({
          run: async () => ({ success: true }),
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
        run: async () => ({ success: true }),
      };
    },
  } as unknown as D1Database;

  return { db, upsertBinds, selectResults };
}

describe("d1/lifecycle", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("upserts and reads a single lifecycle row", async () => {
    const { db, upsertBinds } = createMockDb();

    await upsertLifecycle(db, {
      congress: 119,
      billType: "hr",
      billNumber: 6644,
      introducedDate: "2025-12-11",
      presentedDate: "2026-06-29",
      signedDate: null,
      vetoedDate: null,
      becameLawDate: null,
      lawKind: null,
      publicLaw: null,
      latestActionDate: "2026-06-29",
      latestActionText: "Presented to President.",
    });

    expect(upsertBinds).toHaveLength(1);
    expect(upsertBinds[0]?.[1]).toBe("HR");

    const row = await getLifecycle(db, 119, "HR", 6644);
    expect(row).toMatchObject({
      congress: 119,
      bill_type: "HR",
      bill_number: 6644,
      introduced_date: "2025-12-11",
      presented_date: "2026-06-29",
      latest_action_text: "Presented to President.",
    });
  });

  it("upsert preserves stored milestones when a refresh returns sparse data", async () => {
    // A 200 response with an empty/partial actions list must not wipe
    // previously stored milestone dates; date/text columns coalesce.
    // law_kind uses CASE so a prior veto cannot stick after enactment.
    const sqls: string[] = [];
    const db = {
      prepare: (sql: string) => {
        sqls.push(sql);
        return {
          bind: () => ({ run: async () => ({ success: true }) }),
          run: async () => ({ success: true }),
        };
      },
    } as unknown as D1Database;

    await upsertLifecycle(db, {
      congress: 119,
      billType: "HR",
      billNumber: 6644,
      introducedDate: null,
      presentedDate: null,
      signedDate: null,
      vetoedDate: null,
      becameLawDate: null,
      lawKind: null,
      publicLaw: null,
      latestActionDate: null,
      latestActionText: null,
    });

    const upsertSql = sqls.find((s) => s.includes("INSERT INTO bill_lifecycle")) ?? "";
    for (const column of [
      "introduced_date",
      "presented_date",
      "signed_date",
      "vetoed_date",
      "became_law_date",
      "public_law",
      "latest_action_date",
      "latest_action_text",
    ]) {
      expect(upsertSql).toContain(
        `${column} = COALESCE(excluded.${column}, bill_lifecycle.${column})`
      );
    }
    expect(upsertSql).toContain(
      "WHEN excluded.became_law_date IS NOT NULL OR excluded.law_kind IS NOT NULL"
    );
    expect(upsertSql).toContain("THEN excluded.law_kind");
  });

  it("bulk-reads lifecycles for a set of bills", async () => {
    const { db } = createMockDb();

    await upsertLifecycle(db, {
      congress: 119,
      billType: "HR",
      billNumber: 6644,
      introducedDate: "2025-12-11",
      presentedDate: "2026-06-29",
      signedDate: null,
      vetoedDate: null,
      becameLawDate: null,
      lawKind: null,
      publicLaw: null,
      latestActionDate: "2026-06-29",
      latestActionText: "Presented to President.",
    });
    await upsertLifecycle(db, {
      congress: 119,
      billType: "S",
      billNumber: 1,
      introducedDate: "2025-01-01",
      presentedDate: null,
      signedDate: "2026-01-15",
      vetoedDate: null,
      becameLawDate: "2026-01-15",
      lawKind: "signed",
      publicLaw: "119-1",
      latestActionDate: "2026-01-15",
      latestActionText: "Became Public Law No: 119-1.",
    });

    const map = await getLifecyclesForBills(db, [
      { congress: 119, billType: "HR", billNumber: 6644 },
      { congress: 119, billType: "S", billNumber: 1 },
      { congress: 119, billType: "HR", billNumber: 999 },
    ]);

    expect(map.size).toBe(2);
    expect(map.get(lifecycleMapKey(119, "HR", 6644))?.presented_date).toBe("2026-06-29");
    expect(map.get(lifecycleMapKey(119, "S", 1))?.law_kind).toBe("signed");
    expect(map.has(lifecycleMapKey(119, "HR", 999))).toBe(false);
  });
});
