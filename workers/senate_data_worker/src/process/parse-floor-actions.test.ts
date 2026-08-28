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
          actionCode: "1000",
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
