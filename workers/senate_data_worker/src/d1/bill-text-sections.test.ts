import { describe, expect, it, vi } from "vitest";

import {
  billTextMapKey,
  getBillText,
  getBillTextDocumentsForBills,
  replaceBillTextSections,
} from "./bill-text-sections";

type Stmt = { sql: string; args: unknown[] };

function recordingDb(responses: { first?: unknown; all?: unknown[] } = {}) {
  const batches: Stmt[][] = [];
  const singles: Stmt[] = [];
  const db = {
    exec: vi.fn(async () => {}),
    prepare(sql: string) {
      const stmt: Stmt & {
        bind: (...args: unknown[]) => typeof stmt;
        first: () => Promise<unknown>;
        all: () => Promise<{ results: unknown[] }>;
        run: () => Promise<unknown>;
      } = {
        sql,
        args: [],
        bind: (...args: unknown[]) => {
          stmt.args = args;
          return stmt;
        },
        first: async () => responses.first ?? null,
        all: async () => ({ results: responses.all ?? [] }),
        run: async () => {
          singles.push({ sql, args: stmt.args });
          return { success: true, meta: { changes: 1, duration: 0 } };
        },
      };
      return stmt;
    },
    batch: vi.fn(async (statements: Stmt[]) => {
      batches.push(statements.map((s) => ({ sql: s.sql, args: s.args })));
      return statements.map(() => ({ success: true, results: [] }));
    }),
  } as unknown as D1Database;
  return { db, batches, singles };
}

const key = { congress: 119, billType: "hr", billNumber: 1 };
const version = { type: "Engrossed in House", date: "2026-07-22" };

describe("bill text sections (D1)", () => {
  it("replaces sections and the document row in one batch, in chunks", async () => {
    const { db, batches } = recordingDb();
    const sections = Array.from({ length: 120 }, (_, i) => ({
      label: `${i + 1}.`,
      heading: `Section ${i + 1}`,
      body: `Body ${i + 1}`,
    }));

    await replaceBillTextSections(db, key, version, sections);

    expect(batches).toHaveLength(1);
    const batch = batches[0]!;
    // DELETE + ceil(120/50)=3 inserts + document upsert
    expect(batch).toHaveLength(5);
    expect(batch[0]!.sql).toContain("DELETE FROM bill_text_sections");
    expect(batch[0]!.args).toEqual([119, "HR", 1]);
    expect(batch[1]!.sql).toContain("INSERT INTO bill_text_sections");
    // First row: congress, type, number, ordinal 0, label, heading, body
    expect(batch[1]!.args.slice(0, 7)).toEqual([119, "HR", 1, 0, "1.", "Section 1", "Body 1"]);
    // Ordinals continue across chunks.
    expect(batch[2]!.args[3]).toBe(50);
    expect(batch[3]!.args[3]).toBe(100);
    const doc = batch[4]!;
    expect(doc.sql).toContain("INSERT INTO bill_text_documents");
    expect(doc.args.slice(0, 6)).toEqual([119, "HR", 1, version.type, version.date, 120]);
  });

  it("maps document rows by normalized key", async () => {
    const { db } = recordingDb({
      all: [
        {
          congress: 119,
          bill_type: "HR",
          bill_number: 1,
          text_version: version.type,
          text_version_date: version.date,
          section_count: 3,
          checked_at: "2026-07-23T00:00:00.000Z",
          fetched_at: "2026-07-23T00:00:00.000Z",
        },
      ],
    });
    const map = await getBillTextDocumentsForBills(db, [key]);
    expect(map.get(billTextMapKey(119, "hr", 1))?.section_count).toBe(3);
    expect(await getBillTextDocumentsForBills(db, [])).toEqual(new Map());
  });

  it("returns null for bills whose text was probed but never fetched", async () => {
    const { db } = recordingDb({
      first: {
        congress: 119,
        bill_type: "HR",
        bill_number: 1,
        text_version: null,
        text_version_date: null,
        section_count: 0,
        checked_at: "2026-07-23T00:00:00.000Z",
        fetched_at: null,
      },
    });
    expect(await getBillText(db, { congress: 119, type: "HR", number: 1 })).toBeNull();
  });
});
