import { describe, expect, it } from "vitest";
import { canBuildBillKey, normalizeHistoricalBillType } from "./bill-ref";
import type { BillRef } from "../types";

describe("canBuildBillKey", () => {
  const cases: Array<{
    label: string;
    bill: BillRef | undefined;
    expected: boolean;
  }> = [
    {
      label: "complete bill ref",
      bill: { congress: 119, type: "S", number: "1" },
      expected: true,
    },
    {
      label: "dotted house bill type",
      bill: { congress: 119, type: "H.R.", number: "42" },
      expected: true,
    },
    { label: "undefined bill", bill: undefined, expected: false },
    {
      label: "missing congress",
      bill: { type: "S", number: "1" } as BillRef,
      expected: false,
    },
    {
      label: "non-numeric congress",
      bill: { congress: "119" as unknown as number, type: "S", number: "1" },
      expected: false,
    },
    {
      label: "missing type",
      bill: { congress: 119, number: "1" } as BillRef,
      expected: false,
    },
    {
      label: "empty type",
      bill: { congress: 119, type: "   ", number: "1" },
      expected: false,
    },
    {
      label: "missing number",
      bill: { congress: 119, type: "S" } as BillRef,
      expected: false,
    },
    {
      label: "empty number",
      bill: { congress: 119, type: "S", number: "" },
      expected: false,
    },
    {
      label: "whitespace-only number",
      bill: { congress: 119, type: "S", number: "  " },
      expected: false,
    },
  ];

  it.each(cases)("$label", ({ bill, expected }) => {
    expect(canBuildBillKey(bill)).toBe(expected);
  });
});

describe("normalizeHistoricalBillType", () => {
  it("normalizes dotted and compact bill labels", () => {
    expect(normalizeHistoricalBillType("H.R.")).toBe("H.R.");
    expect(normalizeHistoricalBillType("hr")).toBe("H.R.");
    expect(normalizeHistoricalBillType("S")).toBe("S");
    expect(normalizeHistoricalBillType("S.J.Res.")).toBe("S.J.RES.");
    expect(normalizeHistoricalBillType("H.J.Res.")).toBe("H.J.RES.");
    expect(normalizeHistoricalBillType("S.Con.Res.")).toBe("S.CON.RES.");
    expect(normalizeHistoricalBillType("H.Con.Res.")).toBe("H.CON.RES.");
    expect(normalizeHistoricalBillType("H.Res.")).toBe("H.RES.");
    expect(normalizeHistoricalBillType("S.Res.")).toBe("S.RES.");
  });
});
