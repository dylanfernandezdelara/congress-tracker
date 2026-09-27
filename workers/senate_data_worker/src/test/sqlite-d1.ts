import { execFileSync } from "node:child_process";

/** CI is Node 20 (no `node:sqlite`), so a tiny D1 stand-in runs every statement through the sqlite3 CLI. Binds are `?N`. */
export function sqliteD1(dbPath: string): D1Database {
  const literal = (value: unknown): string =>
    value === null || value === undefined ? "NULL" :
    typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
  const statement = (sql: string, binds: unknown[] = []) => {
    const bound = sql.replace(/\?(\d+)/g, (_m, n: string) => literal(binds[Number(n) - 1]));
    const run = (json: boolean) =>
      execFileSync("sqlite3", json ? ["-json", dbPath, bound] : [dbPath, bound], { encoding: "utf8" }).trim();
    const self = {
      bound,
      bind: (...values: unknown[]) => statement(sql, values),
      all: async () => ({ results: run(true) ? JSON.parse(run(true)) : [] }),
      first: async () => {
        const out = run(true);
        return out ? (JSON.parse(out)[0] ?? null) : null;
      },
      run: async () => {
        run(false);
        return { success: true };
      },
    };
    return self;
  };
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      for (const s of stmts) await s.run();
      return [];
    },
  } as unknown as D1Database;
}
