#!/usr/bin/env node
/**
 * Run a worker pipeline task (scripts/prod-tasks.ts) from this machine against the production D1 database.
 * No admin token and no `wrangler dev`: the worker's code runs in Node, and its database calls go through
 * `wrangler d1 execute --remote` with this machine's `wrangler login`. Congress.gov calls use CONGRESS_API_KEY
 * from .dev.vars.
 *
 *   npm run prod-data -- lifecycle-recheck              dry run: reads only, prints what would change
 *   npm run prod-data -- lifecycle-recheck --apply      writes the changes
 *   npm run prod-data -- <task> [--apply] [--limit N]
 *
 * Writes are held and sent together in one `wrangler d1 execute --file` before the next read (and at the end),
 * so a run costs a few wrangler calls, not one per row. A dry run refuses to write at all.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = (name) => join(workerDir, "node_modules/.bin", name);
const DB_NAME = "congress-tracker";

const args = process.argv.slice(2);
const task = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
const apply = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null;

const tmp = mkdtempSync(join(tmpdir(), "prod-data-"));
try {
  const bundle = join(tmp, "tasks.mjs");
  execFileSync(bin("esbuild"), [
    join(workerDir, "scripts/prod-tasks.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${bundle}`, "--log-level=error",
  ]);
  const { tasks } = await import(pathToFileURL(bundle).href);
  if (!task || !tasks[task]) {
    console.error(`usage: npm run prod-data -- <task> [--apply] [--limit N]\ntasks: ${Object.keys(tasks).join(", ")}`);
    process.exit(2);
  }

  const devVars = readFileSync(join(workerDir, ".dev.vars"), "utf8");
  const devVar = (name) => devVars.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
  const toml = readFileSync(join(workerDir, "wrangler.toml"), "utf8");
  const tomlVar = (name) => toml.match(new RegExp(`^${name} = "([^"]*)"`, "m"))?.[1];
  const apiKey = devVar("CONGRESS_API_KEY");
  if (!apiKey) throw new Error("CONGRESS_API_KEY missing from .dev.vars");

  const db = remoteD1({ apply, tmp });
  const env = { DB: db, CONGRESS: tomlVar("CONGRESS"), SESSION: tomlVar("SESSION"), CONGRESS_API_KEY: apiKey };
  const started = Date.now();
  const result = await tasks[task](env, { apply, limit });
  await db.flush();
  console.log(JSON.stringify({ task, applied: apply, seconds: Math.round((Date.now() - started) / 1000), d1: db.stats, ...result }, null, 2));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

/** A SQL literal for one bound value. */
function literal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`cannot bind ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Inline `?` / `?N` parameters, skipping quoted strings and identifiers. */
function inline(sql, values) {
  let out = "";
  let next = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      const end = sql.indexOf(c, i + 1);
      if (end < 0) throw new Error("unterminated quote in SQL");
      out += sql.slice(i, end + 1);
      i = end;
    } else if (c === "?") {
      const m = /^\d+/.exec(sql.slice(i + 1));
      const index = m ? Number(m[0]) - 1 : next++;
      if (index >= values.length) throw new Error(`SQL needs parameter ${index + 1}, got ${values.length}`);
      out += literal(values[index]);
      if (m) i += m[0].length;
    } else {
      out += c;
    }
  }
  return out;
}

function isRead(sql) {
  return /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) && !/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(sql);
}

/** D1Database over `wrangler d1 execute --remote`: reads run at once, writes are held and sent in one file. */
function remoteD1({ apply, tmp }) {
  const pending = [];
  const stats = { reads: 0, writes: 0, write_calls: 0 };
  // Throws when wrangler exits non-zero. A --file upload prints progress lines before its JSON, so parse from the
  // first line that opens the JSON array.
  const wrangler = (extra) => {
    const stdout = execFileSync(bin("wrangler"), ["d1", "execute", DB_NAME, "--remote", "--json", ...extra], {
      cwd: workerDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const start = stdout.search(/^\[/m);
    if (start < 0) throw new Error(`wrangler printed no JSON:\n${stdout.slice(0, 500)}`);
    return JSON.parse(stdout.slice(start));
  };
  const flush = async () => {
    if (!pending.length) return;
    const file = join(tmp, `writes-${stats.write_calls}.sql`);
    writeFileSync(file, pending.map((s) => `${s.trim().replace(/;\s*$/, "")};`).join("\n"));
    wrangler(["--file", file, "--yes"]);
    stats.writes += pending.length;
    stats.write_calls += 1;
    pending.length = 0;
  };
  const read = async (sql) => {
    await flush(); // a read sees every earlier write
    stats.reads += 1;
    const out = wrangler(["--command", sql]);
    return out[0]?.results ?? [];
  };
  const write = (sql) => {
    if (!apply) throw new Error(`dry run tried to write: ${sql.slice(0, 120)}`);
    pending.push(sql);
  };
  const statement = (sql, values = []) => ({
    bind: (...v) => statement(sql, v),
    async all() {
      return { results: await read(inline(sql, values)), success: true, meta: {} };
    },
    async first(column) {
      const row = (await read(inline(sql, values)))[0] ?? null;
      return column && row ? row[column] : row;
    },
    async raw() {
      return (await read(inline(sql, values))).map((r) => Object.values(r));
    },
    async run() {
      const text = inline(sql, values);
      if (isRead(text)) return { results: await read(text), success: true, meta: {} };
      write(text);
      return { success: true, meta: { changes: 0 }, results: [] };
    },
  });
  return {
    stats,
    flush,
    prepare: (sql) => statement(sql),
    async batch(stmts) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
    async exec(sql) {
      write(sql);
      return { count: 1, duration: 0 };
    },
  };
}
