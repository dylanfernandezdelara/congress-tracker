import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PLATFORM_SCHEMA_SQL } from "./schema";

/** Normalized platform schema: tables -> column names, plus index names. */
type NetSchema = {
  tables: Map<string, Set<string>>;
  indexes: Set<string>;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "../../migrations");
const SCHEMA_TS_PATH = join(HERE, "schema.ts");

// ---------------------------------------------------------------------------
// SQL parsing helpers (migrations + PLATFORM_SCHEMA_SQL use the same shapes)
// ---------------------------------------------------------------------------

/** Strip line comments and collapse whitespace for stable matching. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Split on semicolons into individual executable statements. */
function splitStatements(sql: string): string[] {
  return stripComments(sql)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Column names inside a CREATE TABLE (...) body.
 * Skips table-level PRIMARY KEY / CONSTRAINT lines; keeps inline `col TYPE PRIMARY KEY`.
 */
function parseCreateTableColumns(body: string): Set<string> {
  const columns = new Set<string>();
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().replace(/,$/, "");
    if (!line) continue;
    const upper = line.toUpperCase();
    if (
      upper.startsWith("PRIMARY KEY") ||
      upper.startsWith("FOREIGN KEY") ||
      upper.startsWith("UNIQUE") ||
      upper.startsWith("CHECK") ||
      upper.startsWith("CONSTRAINT")
    ) {
      continue;
    }
    const match = line.match(/^["`]?(\w+)["`]?/i);
    if (match) columns.add(match[1].toLowerCase());
  }
  return columns;
}

function parseCreateTable(statement: string): { table: string; columns: Set<string> } | null {
  const match = statement.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(/i
  );
  if (!match) return null;
  const table = match[1].toLowerCase();
  const open = statement.indexOf("(");
  const close = statement.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  return { table, columns: parseCreateTableColumns(statement.slice(open + 1, close)) };
}

function parseAlterAddColumn(statement: string): { table: string; column: string } | null {
  const match = statement.match(
    /ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+COLUMN\s+["`]?(\w+)["`]?/i
  );
  if (!match) return null;
  return { table: match[1].toLowerCase(), column: match[2].toLowerCase() };
}

function parseAlterDropColumn(statement: string): { table: string; column: string } | null {
  const match = statement.match(
    /ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+DROP\s+COLUMN\s+["`]?(\w+)["`]?/i
  );
  if (!match) return null;
  return { table: match[1].toLowerCase(), column: match[2].toLowerCase() };
}

function parseDropTable(statement: string): string | null {
  const match = statement.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/i);
  return match ? match[1].toLowerCase() : null;
}

function parseCreateIndex(statement: string): string | null {
  const match = statement.match(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/i
  );
  return match ? match[1].toLowerCase() : null;
}

function parseDropIndex(statement: string): string | null {
  const match = statement.match(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/i);
  return match ? match[1].toLowerCase() : null;
}

function emptyNetSchema(): NetSchema {
  return { tables: new Map(), indexes: new Set() };
}

/** Apply one migration statement to cumulative net schema state. */
function applyStatement(state: NetSchema, statement: string): void {
  const createTable = parseCreateTable(statement);
  if (createTable) {
    state.tables.set(createTable.table, createTable.columns);
    return;
  }

  const alter = parseAlterAddColumn(statement);
  if (alter) {
    const cols = state.tables.get(alter.table) ?? new Set<string>();
    cols.add(alter.column);
    state.tables.set(alter.table, cols);
    return;
  }

  const dropColumn = parseAlterDropColumn(statement);
  if (dropColumn) {
    const cols = state.tables.get(dropColumn.table);
    if (cols) {
      cols.delete(dropColumn.column);
      state.tables.set(dropColumn.table, cols);
    }
    return;
  }

  const dropTable = parseDropTable(statement);
  if (dropTable) {
    state.tables.delete(dropTable);
    return;
  }

  const createIndex = parseCreateIndex(statement);
  if (createIndex) {
    state.indexes.add(createIndex);
    return;
  }

  const dropIndex = parseDropIndex(statement);
  if (dropIndex) {
    state.indexes.delete(dropIndex);
  }
}

function applySqlBatch(state: NetSchema, sql: string): void {
  for (const statement of splitStatements(sql)) {
    applyStatement(state, statement);
  }
}

/** Lexical-order migration files -> net schema after full deploy history. */
function netSchemaFromMigrations(): NetSchema {
  const state = emptyNetSchema();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    applySqlBatch(state, sql);
  }
  return state;
}

/**
 * Indexes and columns applied only inside ensurePlatformSchema(), not in
 * PLATFORM_SCHEMA_SQL. Parsed from schema.ts so the test tracks runtime extras.
 */
function extractEnsurePlatformSchemaBody(source: string): string {
  const start = source.indexOf("export async function ensurePlatformSchema");
  if (start < 0) return "";
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) return "";
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

function ensurePlatformSchemaExtras(): { columns: Map<string, Set<string>>; indexes: Set<string> } {
  const source = readFileSync(SCHEMA_TS_PATH, "utf8");
  const body = extractEnsurePlatformSchemaBody(source);

  const columns = new Map<string, Set<string>>();
  const ensureColumnRe = /ensureColumn\s*\(\s*db\s*,\s*"(\w+)"\s*,\s*"(\w+)"/g;
  for (const match of body.matchAll(ensureColumnRe)) {
    const table = match[1].toLowerCase();
    const column = match[2].toLowerCase();
    const cols = columns.get(table) ?? new Set<string>();
    cols.add(column);
    columns.set(table, cols);
  }

  const indexes = new Set<string>();
  const indexRe = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi;
  for (const match of body.matchAll(indexRe)) {
    indexes.add(match[1].toLowerCase());
  }

  return { columns, indexes };
}

function netSchemaFromPlatform(): NetSchema {
  const state = emptyNetSchema();
  applySqlBatch(state, PLATFORM_SCHEMA_SQL);

  const extras = ensurePlatformSchemaExtras();
  for (const [table, cols] of extras.columns) {
    const existing = state.tables.get(table) ?? new Set<string>();
    for (const col of cols) existing.add(col);
    state.tables.set(table, existing);
  }
  for (const idx of extras.indexes) {
    state.indexes.add(idx);
  }

  return state;
}

function sortedTableNames(schema: NetSchema): string[] {
  return [...schema.tables.keys()].sort();
}

function formatSchemaDiff(left: NetSchema, right: NetSchema): string {
  const lines: string[] = [];

  const leftTables = new Set(sortedTableNames(left));
  const rightTables = new Set(sortedTableNames(right));
  const onlyLeftTables = [...leftTables].filter((t) => !rightTables.has(t));
  const onlyRightTables = [...rightTables].filter((t) => !leftTables.has(t));
  if (onlyLeftTables.length) lines.push(`tables only in migrations: ${onlyLeftTables.join(", ")}`);
  if (onlyRightTables.length) lines.push(`tables only in platform: ${onlyRightTables.join(", ")}`);

  for (const table of [...leftTables].filter((t) => rightTables.has(t)).sort()) {
    const leftCols = left.tables.get(table)!;
    const rightCols = right.tables.get(table)!;
    const onlyLeft = [...leftCols].filter((c) => !rightCols.has(c)).sort();
    const onlyRight = [...rightCols].filter((c) => !leftCols.has(c)).sort();
    if (onlyLeft.length || onlyRight.length) {
      lines.push(
        `columns mismatch on ${table}: migrations-only=[${onlyLeft.join(", ")}] platform-only=[${onlyRight.join(", ")}]`
      );
    }
  }

  const onlyLeftIdx = [...left.indexes].filter((i) => !right.indexes.has(i)).sort();
  const onlyRightIdx = [...right.indexes].filter((i) => !left.indexes.has(i)).sort();
  if (onlyLeftIdx.length) lines.push(`indexes only in migrations: ${onlyLeftIdx.join(", ")}`);
  if (onlyRightIdx.length) lines.push(`indexes only in platform: ${onlyRightIdx.join(", ")}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

describe("schema drift guard", () => {
  const migrationsNet = netSchemaFromMigrations();
  const platformNet = netSchemaFromPlatform();

  it("exposes net table names for eyeballing (migrations path)", () => {
    expect(sortedTableNames(migrationsNet)).toMatchInlineSnapshot(`
      [
        "bills",
        "daily_briefings",
        "historical_context",
        "ingested_vote_details",
        "issue_thread_votes",
        "issue_threads",
        "kv_documents",
        "pipeline_checkpoints",
        "source_fetch_log",
        "vote_members",
        "vote_read_models",
        "votes",
      ]
    `);
  });

  it("migrations net effect matches PLATFORM_SCHEMA_SQL + ensurePlatformSchema extras", () => {
    const diff = formatSchemaDiff(migrationsNet, platformNet);
    expect(diff, diff || "schemas should match").toBe("");

    expect(sortedTableNames(migrationsNet)).toEqual(sortedTableNames(platformNet));

    for (const table of sortedTableNames(migrationsNet)) {
      expect([...migrationsNet.tables.get(table)!].sort()).toEqual(
        [...platformNet.tables.get(table)!].sort()
      );
    }

    expect([...migrationsNet.indexes].sort()).toEqual([...platformNet.indexes].sort());
  });
});
