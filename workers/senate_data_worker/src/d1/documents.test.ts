import { describe, expect, it } from "vitest";
import { readDocumentJson, writeDocumentJson } from "./documents";

type KvDocumentsTestDb = D1Database & { insertCount: number };

function createKvDocumentsDb(initial: Record<string, string> = {}): KvDocumentsTestDb {
  const rows = new Map(Object.entries(initial));
  let insertCount = 0;

  const db = {
    rows,
    get insertCount() {
      return insertCount;
    },
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async run() {
          if (normalized.includes("INSERT OR REPLACE INTO kv_documents")) {
            const [docKey, contentType, body, updatedAt] = bound as [string, string, string, string];
            rows.set(docKey, JSON.stringify({ contentType, body, updatedAt }));
            insertCount += 1;
          }
          if (normalized.includes("DELETE FROM kv_documents")) {
            rows.delete(String(bound[0]));
          }
          return { success: true, meta: { duration: 0 } };
        },
        async all<T>() {
          if (normalized.includes("SELECT body FROM kv_documents")) {
            const docKey = String(bound[0]);
            const stored = rows.get(docKey);
            if (!stored) {
              return { results: [], success: true, meta: { duration: 0 } } as T;
            }
            const parsed = JSON.parse(stored) as { body: string };
            return { results: [{ body: parsed.body }], success: true, meta: { duration: 0 } } as T;
          }
          return { results: [], success: true, meta: { duration: 0 } } as T;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      await Promise.all(statements.map((statement) => statement.run()));
      return statements.map(() => ({ success: true, meta: { duration: 0 } }));
    },
  };
  return db as unknown as KvDocumentsTestDb;
}

describe("kv_documents helpers", () => {
  it("round-trips JSON documents", async () => {
    const db = createKvDocumentsDb();
    await writeDocumentJson(db, "briefings/latest.json", { items: [{ id: "vote-1" }] });
    const found = await readDocumentJson<{ items: Array<{ id: string }> }>(db, "briefings/latest.json");
    expect(found).toEqual({ items: [{ id: "vote-1" }] });
  });

  it("skips unchanged JSON while ignoring volatile timestamps", async () => {
    const db = createKvDocumentsDb();

    await writeDocumentJson(db, "briefings/latest.json", {
      generated_at: "2026-01-05T00:00:00.000Z",
      run_id: "run-old",
      items: [{ id: "vote-1", title: "Same vote" }],
    });
    await writeDocumentJson(
      db,
      "briefings/latest.json",
      {
        generated_at: "2026-01-05T01:00:00.000Z",
        run_id: "run-new",
        items: [{ id: "vote-1", title: "Same vote" }],
      },
      { skipIfUnchanged: true }
    );

    expect(db.insertCount).toBe(1);
  });

  it("writes when stable payload changes", async () => {
    const db = createKvDocumentsDb();
    await writeDocumentJson(db, "briefings/latest.json", { items: [{ id: "vote-1" }] }, { skipIfUnchanged: true });
    await writeDocumentJson(db, "briefings/latest.json", { items: [{ id: "vote-2" }] }, { skipIfUnchanged: true });
    const found = await readDocumentJson<{ items: Array<{ id: string }> }>(db, "briefings/latest.json");
    expect(found).toEqual({ items: [{ id: "vote-2" }] });
  });
});
