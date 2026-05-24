export function createSchemaTrackingDb(): D1Database & { tables: Set<string>; indexes: Set<string> } {
  const tables = new Set<string>();
  const indexes = new Set<string>();
  const columns = new Map<string, Set<string>>();

  const db = {
    tables,
    indexes,
    async batch(statements: D1PreparedStatement[]) {
      await Promise.all(statements.map((statement) => statement.run()));
      return statements.map(() => ({ success: true, meta: { duration: 0 } }));
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
          if (normalized.startsWith("CREATE TABLE IF NOT EXISTS")) {
            const match = normalized.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
            if (match) tables.add(match[1]);
          }
          if (normalized.startsWith("CREATE INDEX IF NOT EXISTS")) {
            const match = normalized.match(/CREATE INDEX IF NOT EXISTS (\w+)/i);
            if (match) indexes.add(match[1]);
          }
          if (normalized.startsWith("ALTER TABLE")) {
            const match = normalized.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
            if (match) {
              const tableColumns = columns.get(match[1]) ?? new Set<string>();
              tableColumns.add(match[2]);
              columns.set(match[1], tableColumns);
            }
          }
          if (normalized.startsWith("UPDATE votes SET issue_key")) {
            return { success: true, meta: { duration: 0 } };
          }
          return { success: true, meta: { duration: 0 } };
        },
        async all<T>() {
          if (normalized.startsWith("PRAGMA table_info")) {
            const table = normalized.match(/PRAGMA table_info\((\w+)\)/)?.[1];
            const tableColumns = table ? columns.get(table) ?? new Set<string>() : new Set<string>();
            return {
              results: Array.from(tableColumns).map((name) => ({ name })),
              success: true,
              meta: { duration: 0 },
            } as T;
          }
          return { results: [], success: true, meta: { duration: 0 } } as T;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  };
  return db as unknown as D1Database & { tables: Set<string>; indexes: Set<string> };
}

export function createIngestedVoteDetailsDb(
  initialDetails: Array<{ congress: number; session: number; vote_number: number; vote_date: string; payload: unknown }> = []
): D1Database & { stored: Map<string, string> } {
  const stored = new Map(
    initialDetails.map((detail) => [
      `${detail.congress}:${detail.session}:${detail.vote_number}`,
      JSON.stringify(detail.payload),
    ])
  );
  let schemaReady = false;

  const db = {
    stored,
    async batch(statements: D1PreparedStatement[]) {
      await Promise.all(statements.map((statement) => statement.run()));
      return statements.map(() => ({ success: true, meta: { duration: 0 } }));
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
          if (normalized.includes("CREATE TABLE") || normalized.includes("CREATE INDEX") || normalized.startsWith("ALTER TABLE") || normalized.startsWith("UPDATE votes")) {
            schemaReady = true;
            return { success: true, meta: { duration: 0 } };
          }
          if (normalized.startsWith("INSERT OR REPLACE INTO ingested_vote_details")) {
            const key = `${bound[0]}:${bound[1]}:${bound[2]}`;
            stored.set(key, String(bound[4]));
          }
          return { success: true, meta: { duration: 0 } };
        },
        async all<T>() {
          if (normalized.startsWith("PRAGMA table_info")) {
            return { results: [], success: true, meta: { duration: 0 } } as T;
          }
          if (normalized.includes("FROM ingested_vote_details") && normalized.includes("payload_json")) {
            const congress = Number(bound[0]);
            const session = Number(bound[1]);
            const rows = Array.from(stored.entries())
              .filter(([key]) => key.startsWith(`${congress}:${session}:`))
              .map(([key, payload_json]) => ({
                vote_number: Number(key.split(":")[2]),
                payload_json,
              }));
            return { results: rows, success: true, meta: { duration: 0 } } as T;
          }
          if (normalized.includes("FROM ingested_vote_details") && normalized.includes("vote_number")) {
            const congress = Number(bound[0]);
            const session = Number(bound[1]);
            const rows = Array.from(stored.keys())
              .filter((key) => key.startsWith(`${congress}:${session}:`))
              .map((key) => ({ vote_number: Number(key.split(":")[2]) }));
            return { results: rows, success: true, meta: { duration: 0 } } as T;
          }
          return { results: [], success: true, meta: { duration: 0 } } as T;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  };
  return db as unknown as D1Database & { stored: Map<string, string> };
}
