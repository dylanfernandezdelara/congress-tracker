import { describe, expect, it } from "vitest";
import {
  buildActivitiesIndexKey,
  buildBillEvidenceKey,
  buildBillNarrativeKey,
  buildBillTrendSnapshotKey,
  buildLatestBriefingKey,
  buildLatestChamberContextKey,
  buildMemberLatestKey,
  buildMembersIndexKey,
  buildSessionOverviewKey,
  buildVoteLedgerKey,
} from "./storage";

describe("kv_documents key layout helpers", () => {
  it("builds pipeline document keys consistently", () => {
    expect(buildMembersIndexKey()).toBe("members/index.json");
    expect(buildActivitiesIndexKey()).toBe("activities/index.json");
    expect(buildVoteLedgerKey()).toBe("votes/ledger.json");
    expect(buildSessionOverviewKey()).toBe("stats/overview.json");
    expect(buildLatestBriefingKey()).toBe("briefings/latest.json");
    expect(buildLatestChamberContextKey()).toBe("platform/context/chamber/latest.json");
    expect(buildMemberLatestKey("a000360")).toBe("member/A000360/latest.json");
  });

  it("builds bill evidence and trend keys", () => {
    expect(buildBillEvidenceKey("119-s-210")).toBe("bills/evidence/119-s-210.json");
    expect(buildBillNarrativeKey("119-s-210")).toBe("bills/narrative/119-s-210.json");
    expect(buildBillTrendSnapshotKey(119, "119-s-210", "2026-02-18")).toBe(
      "bills/trends/119/119-s-210/2026-02-18.json"
    );
  });
});
