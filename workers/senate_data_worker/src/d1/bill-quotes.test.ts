import { describe, expect, it, vi } from "vitest";

import { buildBillQuoteId, getBillQuote, insertBillQuote, isBillQuoteId } from "./bill-quotes";

function quoteDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const db = {
    exec: vi.fn(async () => {}),
    prepare(sql: string) {
      const state = {
        args: [] as unknown[],
        bind: (...args: unknown[]) => {
          state.args = args;
          return state;
        },
        first: async () => {
          if (sql.includes("FROM bill_quotes")) return rows.get(String(state.args[0])) ?? null;
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.includes("INSERT INTO bill_quotes")) {
            const [id, congress, billType, number, text, source, createdAt] = state.args;
            if (!rows.has(String(id))) {
              rows.set(String(id), {
                id,
                congress,
                bill_type: billType,
                number,
                text,
                source,
                created_at: createdAt,
              });
            }
          }
          return { success: true, meta: { changes: 1, duration: 0 } };
        },
      };
      return state;
    },
  } as unknown as D1Database;
  return { db, rows };
}

describe("bill quotes", () => {
  const bill = { congress: 119, type: "hr", number: 1 };

  it("derives the same id for the same bill and match-equivalent text", async () => {
    const a = await buildBillQuoteId(bill, "Speeds  energy permits");
    const b = await buildBillQuoteId({ ...bill, type: "HR" }, "speeds energy PERMITS");
    const c = await buildBillQuoteId(bill, "Different text entirely");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(isBillQuoteId(a)).toBe(true);
    expect(a).toHaveLength(16);
  });

  it("rejects malformed ids before hitting D1", () => {
    expect(isBillQuoteId("abc")).toBe(false);
    expect(isBillQuoteId("ABCDEF0123456789")).toBe(false);
    expect(isBillQuoteId(null)).toBe(false);
  });

  it("inserts idempotently and reads back a normalized quote", async () => {
    const { db, rows } = quoteDb();
    const id = await buildBillQuoteId(bill, "Speeds energy permits");
    const first = await insertBillQuote(db, { id, bill, text: "Speeds energy permits", source: "digest" });
    const second = await insertBillQuote(db, { id, bill, text: "speeds energy permits", source: "crs" });
    expect(rows.size).toBe(1);
    expect(first.text).toBe("Speeds energy permits");
    expect(second.text).toBe("Speeds energy permits");
    expect(second.source).toBe("digest");
    expect(second.bill).toEqual({ congress: 119, type: "HR", number: 1 });
    await expect(getBillQuote(db, "0000000000000000")).resolves.toBeNull();
  });
});
