import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(rootDir, "scripts", "refresh-production-senate-menu.mjs");
const sharedMenu = path.join(rootDir, "shared", "senate-vote-menu.ts");
const workerWrangler = path.join(
  rootDir,
  "workers",
  "senate_data_worker",
  "wrangler.toml"
);

function readProductionD1IdFromShared() {
  const src = fs.readFileSync(sharedMenu, "utf8");
  const match = src.match(
    /export const PRODUCTION_D1_DATABASE_ID\s*=\s*"([^"]+)"/
  );
  assert.ok(match?.[1], "shared/senate-vote-menu.ts PRODUCTION_D1_DATABASE_ID missing");
  return match[1];
}

test("refresh-production-senate-menu script exists", () => {
  assert.ok(fs.statSync(script).isFile());
});

test("default D1 database id matches wrangler.toml and shared helper", () => {
  const sharedId = readProductionD1IdFromShared();
  const toml = fs.readFileSync(workerWrangler, "utf8");
  const match = toml.match(
    /\[\[d1_databases\]\][\s\S]*?^database_id\s*=\s*"([^"]+)"/m
  );
  assert.ok(match?.[1], "wrangler.toml production database_id missing");
  assert.equal(sharedId, match[1]);

  const scriptSrc = fs.readFileSync(script, "utf8");
  assert.match(
    scriptSrc,
    new RegExp(`PRODUCTION_D1_DATABASE_ID = "${sharedId}"`)
  );
});

test("REFRESH_PRINT_ONLY documents admin route and modes without network", () => {
  const sharedId = readProductionD1IdFromShared();
  const out = execFileSync(process.execPath, [script], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, REFRESH_PRINT_ONLY: "1" },
  });
  assert.match(out, /refresh-production-senate-menu/);
  assert.match(out, /vote_menu_119_2\.xml/);
  assert.match(out, /senate_vote_menu_cache_119_2/);
  assert.match(out, new RegExp(sharedId));
  assert.match(out, /\/__pipeline\/senate-vote-menu/);
  assert.match(out, /RUN_FEED/);
  assert.match(out, /CHECK_HEALTH/);
  assert.match(out, /ADMIN_FALLBACK_D1/);
  assert.match(out, /REFRESH_VIA/);
  assert.match(out, /CONGRESS/);
  assert.match(out, /SESSION/);
  assert.match(out, /D1_DATABASE_ID/);
});

test("refresh script documents D1 health fallback and admin→D1 fallback", () => {
  const src = fs.readFileSync(script, "utf8");
  assert.match(src, /checkHealthViaD1/);
  assert.match(src, /adminFallbackD1Enabled/);
  assert.match(src, /fallback:\s*"d1"/);
});
