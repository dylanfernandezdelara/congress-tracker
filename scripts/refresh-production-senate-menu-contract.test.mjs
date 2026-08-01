import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PRODUCTION_D1_DATABASE_ID } from "../shared/senate-vote-menu.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(rootDir, "scripts", "refresh-production-senate-menu.mjs");
const workerWrangler = path.join(
  rootDir,
  "workers",
  "senate_data_worker",
  "wrangler.toml"
);

test("refresh-production-senate-menu script exists", () => {
  assert.ok(fs.statSync(script).isFile());
});

test("default D1 database id matches wrangler.toml production database_id", () => {
  const toml = fs.readFileSync(workerWrangler, "utf8");
  const match = toml.match(
    /\[\[d1_databases\]\][\s\S]*?^database_id\s*=\s*"([^"]+)"/m
  );
  assert.ok(match?.[1], "wrangler.toml production database_id missing");
  assert.equal(PRODUCTION_D1_DATABASE_ID, match[1]);
});

test("REFRESH_PRINT_ONLY documents admin route and modes without network", () => {
  const out = execFileSync(process.execPath, [script], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, REFRESH_PRINT_ONLY: "1" },
  });
  assert.match(out, /refresh-production-senate-menu/);
  assert.match(out, /vote_menu_119_2\.xml/);
  assert.match(out, /senate_vote_menu_cache_119_2/);
  assert.match(out, new RegExp(PRODUCTION_D1_DATABASE_ID));
  assert.match(out, /\/__pipeline\/senate-vote-menu/);
  assert.match(out, /RUN_FEED/);
  assert.match(out, /CHECK_HEALTH/);
  assert.match(out, /REFRESH_VIA/);
  assert.match(out, /CONGRESS/);
  assert.match(out, /SESSION/);
  assert.match(out, /D1_DATABASE_ID/);
});
