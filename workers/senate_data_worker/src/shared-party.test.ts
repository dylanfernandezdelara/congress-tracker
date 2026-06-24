import { describe, expect, it } from "vitest";
import {
  chamberControlLabel,
  normalizePartyCode,
  partyDisplayName,
} from "../../../shared/party";

describe("party helpers", () => {
  it("normalizes common party strings", () => {
    expect(normalizePartyCode("Democrat")).toBe("D");
    expect(normalizePartyCode("REP")).toBe("R");
    expect(normalizePartyCode("Independent")).toBe("I");
    expect(normalizePartyCode(null)).toBe("Other");
  });

  it("builds control labels", () => {
    expect(chamberControlLabel("R", 100)).toBe("Republican control");
    expect(chamberControlLabel(null, 100)).toBe("No clear majority");
    expect(chamberControlLabel(null, 0)).toBe("No membership data");
    expect(partyDisplayName("D")).toBe("Democrat");
  });
});
