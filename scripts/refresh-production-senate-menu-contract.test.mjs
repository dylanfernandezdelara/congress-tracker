import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(rootDir, "scripts", "refresh-production-senate-menu.mjs");

test("refresh-production-senate-menu script exists", () => {
  assert.ok(fs.statSync(script).isFile());
});

test("REFRESH_PRINT_ONLY documents admin route and modes without network", () => {
  const out = execFileSync(
    process.execPath,
    ["--experimental-strip-types", script],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, REFRESH_PRINT_ONLY: "1" },
    }
  );
  assert.match(out, /refresh-production-senate-menu/);
  assert.match(out, /vote_menu_119_2\.xml/);
  assert.match(out, /senate_vote_menu_cache_119_2/);
  assert.match(out, /\/__pipeline\/senate-vote-menu/);
  assert.match(out, /RUN_FEED/);
  assert.match(out, /CHECK_HEALTH/);
  assert.match(out, /REFRESH_VIA/);
  assert.match(out, /CONGRESS/);
  assert.match(out, /SESSION/);
});
