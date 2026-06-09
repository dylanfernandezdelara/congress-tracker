import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSenateVoteMenuXml } from "./senate-votes";

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
});
