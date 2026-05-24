import { describe, expect, it } from "vitest";
import { normalizeHistoricalBillType } from "./bill-ref";

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
