import { describe, expect, it } from "vitest";
import { extractFloorTally, parseFloorActions } from "./parse-floor-actions";

describe("extractFloorTally", () => {
  it("reads cloture and voice tallies", () => {
    expect(
      extractFloorTally("Cloture on the measure invoked in Senate by Yea-Nay Vote. 60 - 37.")
    ).toBe("60-37");
    expect(extractFloorTally("Considered under suspension of the rules (voice vote).")).toBe(
      "voice vote"
    );
    expect(extractFloorTally("Measure laid before Senate by unanimous consent.")).toBe(
      "unanimous consent"
    );
  });
});

describe("parseFloorActions", () => {
  it("keeps received, calendar, cloture, considered, and conference", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "hr",
      billNumber: 1,
      actions: [
        {
          actionDate: "2026-01-03",
          text: "Introduced in House",
          type: "IntroReferral",
          actionCode: "1000",
        },
        {
          actionDate: "2026-01-03",
          text: "Referred to the House Committee on Energy and Commerce.",
          type: "IntroReferral",
        },
        {
          actionDate: "2026-03-20",
          text: "Placed on the Union Calendar, Calendar No. 88.",
          type: "Calendars",
          actionCode: "H12410",
        },
        {
          actionDate: "2026-03-21",
          text: "Considered under suspension of the rules.",
          type: "Floor",
        },
        {
          actionDate: "2026-03-22",
          text: "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 220 - 213.",
          type: "Floor",
        },
        {
          actionDate: "2026-03-23",
          text: "Received in the Senate and Read twice and referred to the Committee on Finance.",
          type: "IntroReferral",
        },
        {
          actionDate: "2026-04-01",
          text: "Cloture on the measure invoked in Senate by Yea-Nay Vote. 60 - 37.",
          type: "Floor",
        },
        {
          actionDate: "2026-04-10",
          text: "Conference report H. Rept. 119-12 filed.",
          type: "ResolvingDifferences",
        },
        {
          actionDate: "2026-04-20",
          text: "Presented to President.",
          type: "President",
          actionCode: "28000",
        },
      ],
    });

    expect(events.map((e) => e.actionKey)).toEqual([
      "calendar",
      "considered",
      "received",
      "cloture",
      "conference",
    ]);
    expect(events.find((e) => e.actionKey === "calendar")?.chamber).toBe("House");
    expect(events.find((e) => e.actionKey === "received")?.label).toBe("Received in the Senate");
    expect(events.find((e) => e.actionKey === "cloture")?.tallyText).toBe("60-37");
    expect(events.find((e) => e.actionKey === "conference")?.label).toBe("Conference committee");
  });

  it("does not treat LOC intro/report codes as received or calendar", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "hr",
      billNumber: 8,
      actions: [
        {
          actionDate: "2026-01-03",
          text: "Introduced in House",
          actionCode: "1000",
        },
        {
          actionDate: "2026-02-01",
          text: "Reported to House",
          actionCode: "5000",
          type: "Committee",
        },
      ],
    });
    expect(events).toEqual([]);
  });

  it("classifies House received from H14000 even without the usual phrase", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "s",
      billNumber: 47,
      actions: [
        {
          actionDate: "2026-05-02",
          text: "Message received.",
          actionCode: "H14000",
          sourceSystem: { name: "House" },
        },
      ],
    });
    expect(events).toEqual([
      expect.objectContaining({
        actionKey: "received",
        chamber: "House",
        label: "Received in the House",
      }),
    ]);
  });

  it("does not call amendment ping-pong a conference", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "hr",
      billNumber: 4,
      actions: [
        {
          actionDate: "2026-06-01",
          text: "Senate agreed to the House amendment to the Senate amendment.",
          type: "ResolvingDifferences",
          sourceSystem: { name: "Senate" },
        },
      ],
    });
    expect(events).toEqual([]);
  });

  it("keeps calendar placement bundled with a committee report line", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "s",
      billNumber: 9,
      actions: [
        {
          actionDate: "2026-03-01",
          text: "Reported to Senate without amendment. Placed on Senate Legislative Calendar under General Orders. Calendar No. 12.",
          type: "Calendars",
        },
      ],
    });
    expect(events.map((e) => e.actionKey)).toEqual(["calendar"]);
    expect(events[0]?.chamber).toBe("Senate");
  });

  it("keeps first and last debate days instead of filling the cap with considered rows", () => {
    const actions = Array.from({ length: 30 }, (_, i) => ({
      actionDate: `2026-03-${String(i + 1).padStart(2, "0")}`,
      text: "Considered as unfinished business.",
      type: "Floor",
      sourceSystem: { name: "Senate" as const },
    }));
    actions.push({
      actionDate: "2026-04-10",
      text: "Cloture on the measure invoked in Senate by Yea-Nay Vote. 60 - 37.",
      type: "Floor",
      sourceSystem: { name: "Senate" },
    });
    const events = parseFloorActions({
      congress: 119,
      billType: "s",
      billNumber: 2,
      actions,
    });
    expect(events.map((e) => e.actionKey)).toEqual(["considered", "considered", "cloture"]);
    expect(events[0]?.actionAt.startsWith("2026-03-01")).toBe(true);
    expect(events[1]?.actionAt.startsWith("2026-03-30")).toBe(true);
  });

  it("prefers sourceSystem over chamber words in the action text", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "hr",
      billNumber: 3,
      actions: [
        {
          actionDate: "2026-04-02",
          text: "Considered under suspension of the rules. Senate amendment pending.",
          type: "Floor",
          sourceSystem: { name: "House" },
        },
      ],
    });
    expect(events[0]).toMatchObject({ actionKey: "considered", chamber: "House" });
  });

  it("dedupes the same floor action on one date", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "s",
      billNumber: 2,
      actions: [
        {
          actionDate: "2026-05-01",
          text: "Cloture motion on the measure presented in Senate.",
          type: "Floor",
        },
        {
          actionDate: "2026-05-01",
          text: "Cloture motion on the measure presented in Senate (second copy).",
          type: "Floor",
        },
      ],
    });
    expect(events).toHaveLength(1);
  });

  it("skips committee and presidential noise", () => {
    const events = parseFloorActions({
      congress: 119,
      billType: "hr",
      billNumber: 9,
      actions: [
        { actionDate: "2026-01-01", text: "Committee hearings held.", type: "Committee" },
        { actionDate: "2026-01-02", text: "Motion to reconsider laid on the table Agreed to." },
        { actionDate: "2026-01-03", text: "Signed by President.", type: "President" },
      ],
    });
    expect(events).toEqual([]);
  });
});
