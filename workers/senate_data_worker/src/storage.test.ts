import { describe, expect, it } from "vitest";
import {
  buildBillEvidenceKey,
  buildBillNarrativeKey,
  buildBillTrendSnapshotKey,
  buildCoverageSnapshotKey,
  buildLatestBriefingKey,
  buildLatestChamberContextKey,
  buildLatestKey,
  buildMemberLatestKey,
  buildMembersIndexKey,
  buildMetaKey,
  buildSnapshotKey,
  buildStateKeys,
  buildVoteDetailKey,
  buildVoteLedgerKey,
} from "./storage";

describe("document key layout helpers", () => {
  it("normalizes state to uppercase for all keys", () => {
    const keys = buildStateKeys("ny", "2025-12-18");

    expect(keys.latest).toBe("state/NY/latest.json");
    expect(keys.snapshot).toBe("state/NY/2025-12-18.json");
    expect(keys.meta).toBe("state/NY/_meta.json");
  });

  it("builds individual keys consistently", () => {
    expect(buildLatestKey("ny")).toBe("state/NY/latest.json");
    expect(buildSnapshotKey("ny", "2025-12-18")).toBe("state/NY/2025-12-18.json");
    expect(buildMetaKey("ny")).toBe("state/NY/_meta.json");
    expect(buildMembersIndexKey()).toBe("members/index.json");
    expect(buildVoteLedgerKey()).toBe("votes/ledger.json");
    expect(buildLatestBriefingKey()).toBe("briefings/latest.json");
    expect(buildLatestChamberContextKey()).toBe("platform/context/chamber/latest.json");
    expect(buildMemberLatestKey("a000360")).toBe("member/A000360/latest.json");
    expect(buildVoteDetailKey(119, 2, 14)).toBe("votes/detail/119/2/14.json");
  });

  it("builds bill evidence and trend keys", () => {
    expect(buildBillEvidenceKey("119-s-210")).toBe("bills/evidence/119-s-210.json");
    expect(buildBillNarrativeKey("119-s-210")).toBe("bills/narrative/119-s-210.json");
    expect(buildBillTrendSnapshotKey(119, "119-s-210", "2026-02-18")).toBe(
      "bills/trends/119/119-s-210/2026-02-18.json"
    );
    expect(buildCoverageSnapshotKey("2026-02-18")).toBe("stats/coverage/2026-02-18.json");
  });
});
