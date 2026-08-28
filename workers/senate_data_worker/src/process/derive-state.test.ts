import { describe, expect, it } from "vitest";
import { toProcessSummary } from "./derive-state";
import type { ProcessCommitteeEvent, ProcessFloorEvent } from "./types";

const sent: ProcessCommitteeEvent = {
  congress: 119,
  billType: "HR",
  billNumber: 1,
  systemCode: "hsif00",
  activityKey: "sent",
  activityAt: "2026-01-10T12:00:00.000Z",
  chamber: "House",
  committeeName: "Energy and Commerce Committee",
  parentSystemCode: null,
  activityRaw: "Referred To",
  tallyText: null,
};

const received: ProcessFloorEvent = {
  congress: 119,
  billType: "HR",
  billNumber: 1,
  actionKey: "received",
  actionAt: "2026-03-23T12:00:00.000Z",
  chamber: "Senate",
  label: "Received in the Senate",
  rawText: "Received in the Senate.",
  tallyText: null,
};

describe("toProcessSummary", () => {
  it("returns null when there are no committee or floor events", () => {
    expect(toProcessSummary("HR", [], new Map(), [])).toBeNull();
  });

  it("includes floor actions beside committee stages", () => {
    const summary = toProcessSummary("HR", [sent], new Map(), [received]);
    expect(summary?.stages).toHaveLength(1);
    expect(summary?.floor_actions).toEqual([
      {
        date: "2026-03-23",
        key: "received",
        label: "Received in the Senate",
        chamber: "Senate",
        tally_text: null,
      },
    ]);
  });

  it("returns a summary for floor-only bills", () => {
    const summary = toProcessSummary("HR", [], new Map(), [received]);
    expect(summary).not.toBeNull();
    expect(summary?.stages).toEqual([]);
    expect(summary?.floor_actions?.[0]?.key).toBe("received");
  });
});
