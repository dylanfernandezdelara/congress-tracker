import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXECUTIVE_POSTS_CRON_UTC, FEED_PIPELINE_CRON_UTC } from "./constants";

const here = dirname(fileURLToPath(import.meta.url));
const workerPackageDir = resolve(here, "..");
const repoRoot = resolve(workerPackageDir, "../..");

const wranglerTomlPaths = [
  join(repoRoot, "wrangler.toml"),
  join(workerPackageDir, "wrangler.toml"),
] as const;

/** Cron expressions the scheduled handler dispatches on. */
const claimedCrons = [FEED_PIPELINE_CRON_UTC, EXECUTIVE_POSTS_CRON_UTC] as const;

/**
 * Anchored to column 0 so a commented-out `# crons = [...]` left above the live
 * array cannot be the match — validating a comment while Cloudflare deploys
 * something else is the silent green-suite failure this file exists to prevent.
 */
function parseCronsFromToml(filePath: string): string[] {
  const content = readFileSync(filePath, "utf8");
  const cronMatch = content.match(/^crons\s*=\s*\[([^\]]+)\]/m);
  if (cronMatch === null) {
    throw new Error(`${filePath}: no [triggers] crons array at column 0`);
  }
  const crons = [...cronMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  expect(crons.length, `${filePath}: crons array parsed empty`).toBeGreaterThan(0);
  return crons;
}

describe("wrangler.toml cron triggers match scheduled-handler constants", () => {
  it.each(wranglerTomlPaths)("%s crons equal FEED + EXECUTIVE constants (bidirectional)", (tomlPath) => {
    const deployedCrons = parseCronsFromToml(tomlPath);

    for (const claimed of claimedCrons) {
      expect(
        deployedCrons,
        `${tomlPath}: missing cron ${JSON.stringify(claimed)} (deployed schedule must include every handler constant)`,
      ).toContain(claimed);
    }

    for (const deployed of deployedCrons) {
      expect(
        claimedCrons as readonly string[],
        `${tomlPath}: unrecognized cron ${JSON.stringify(deployed)} (would hit scheduled_unknown_cron and never ingest)`,
      ).toContain(deployed);
    }

    // Catch duplicates, which the membership checks above would let through.
    // Order is irrelevant to Cloudflare, so compare sorted.
    expect(
      [...deployedCrons].sort(),
      `${tomlPath}: cron list must be exactly the claimed constants (no duplicates)`,
    ).toEqual([...claimedCrons].sort());
  });
});
