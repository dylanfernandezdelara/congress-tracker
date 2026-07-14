import { describe, expect, it } from "vitest";
import {
  deriveTenDayRule,
  nonSundayDaysElapsed,
  tenDayDeadlineDate,
} from "./derive-ten-day";

describe("ten-day rule arithmetic (HR 6644)", () => {
  const presented = "2026-06-29";

  it("sets deadline to 2026-07-10 (excludes Sunday 2026-07-05)", () => {
    expect(tenDayDeadlineDate(presented)).toBe("2026-07-10");
  });

  it("counts non-Sunday days from the day after presentation", () => {
    expect(nonSundayDaysElapsed(presented, "2026-06-29")).toBe(0);
    expect(nonSundayDaysElapsed(presented, "2026-06-30")).toBe(1);
    expect(nonSundayDaysElapsed(presented, "2026-07-04")).toBe(5);
    // Sunday 7/5 does not advance the count
    expect(nonSundayDaysElapsed(presented, "2026-07-05")).toBe(5);
    expect(nonSundayDaysElapsed(presented, "2026-07-06")).toBe(6);
    expect(nonSundayDaysElapsed(presented, "2026-07-10")).toBe(10);
    expect(nonSundayDaysElapsed(presented, "2026-07-11")).toBe(11);
  });

  it("is pending_signature through the deadline day", () => {
    expect(
      deriveTenDayRule({
        presentedDate: presented,
        signedDate: null,
        vetoedDate: null,
        becameLawDate: null,
        now: "2026-07-10",
      })
    ).toEqual({
      status: "pending_signature",
      day_of_ten: 10,
      deadline_date: "2026-07-10",
      becomes_law_on: "2026-07-11",
    });

    expect(
      deriveTenDayRule({
        presentedDate: presented,
        signedDate: null,
        vetoedDate: null,
        becameLawDate: null,
        now: "2026-07-03",
      })
    ).toEqual({
      status: "pending_signature",
      day_of_ten: 4,
      deadline_date: "2026-07-10",
      becomes_law_on: "2026-07-11",
    });
  });

  it("becomes law_unsigned_derived on 2026-07-11 and after", () => {
    expect(
      deriveTenDayRule({
        presentedDate: presented,
        signedDate: null,
        vetoedDate: null,
        becameLawDate: null,
        now: "2026-07-11",
      })
    ).toEqual({
      status: "law_unsigned_derived",
      day_of_ten: null,
      deadline_date: "2026-07-10",
      becomes_law_on: "2026-07-11",
    });

    expect(
      deriveTenDayRule({
        presentedDate: presented,
        signedDate: null,
        vetoedDate: null,
        becameLawDate: null,
        now: "2026-07-14",
      }).status
    ).toBe("law_unsigned_derived");
  });

  it("does not derive when formal signed/vetoed/became-law dates exist", () => {
    expect(
      deriveTenDayRule({
        presentedDate: presented,
        signedDate: "2026-07-02",
        vetoedDate: null,
        becameLawDate: null,
        now: "2026-07-14",
      }).status
    ).toBeNull();

    expect(
      deriveTenDayRule({
        presentedDate: presented,
        signedDate: null,
        vetoedDate: null,
        becameLawDate: "2026-07-11",
        now: "2026-07-14",
      }).status
    ).toBeNull();
  });

  it("returns empty derived when there is no presented date", () => {
    expect(
      deriveTenDayRule({
        presentedDate: null,
        signedDate: null,
        vetoedDate: null,
        becameLawDate: null,
        now: "2026-07-14",
      })
    ).toEqual({
      status: null,
      day_of_ten: null,
      deadline_date: null,
      becomes_law_on: null,
    });
  });
});
