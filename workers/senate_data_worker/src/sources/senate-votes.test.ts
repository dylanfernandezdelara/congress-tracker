import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { voteKey } from "../vote-key";
import { ingestSenatePassageVotes, parseSenateVoteMenuXml } from "./senate-votes";
import * as http from "./http";

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, "../fixtures/senate-vote-menu.sample.xml"), "utf8");

describe("parseSenateVoteMenuXml", () => {
  it("keeps passage votes linked to bills", () => {
    const votes = parseSenateVoteMenuXml(sample, 119, 2);
    expect(votes).toHaveLength(1);
    expect(votes[0]).toMatchObject({
      chamber: "Senate",
      rollNumber: 163,
      bill: { congress: 119, type: "S", number: 2 },
      result: "Passed",
      yeas: 52,
      nays: 47,
      voteDate: "2026-06-05",
    });
  });

  it("skips votes already stored in D1", async () => {
    const fetchText = vi.spyOn(http, "fetchText").mockResolvedValue(sample);
    const env = { CONGRESS: "119", SESSION: "2" } as Env;
    const knownKeys = new Set([
      voteKey({ chamber: "Senate", congress: 119, session: 2, rollNumber: 163 }),
    ]);

    const result = await ingestSenatePassageVotes(env, "2026-01-01", knownKeys);

    expect(result.skipped).toBe(1);
    expect(result.votes).toHaveLength(0);

    fetchText.mockRestore();
  });
});
