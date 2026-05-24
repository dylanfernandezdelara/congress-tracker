import { describe, expect, it } from "vitest";

import { sanitizeRequestUrlForStorage } from "./source-cache";

describe("sanitizeRequestUrlForStorage", () => {
  it("removes api_key query parameters", () => {
    expect(
      sanitizeRequestUrlForStorage(
        "https://api.govinfo.gov/packages/CREC-2026-01-17/summary?api_key=secret-value&foo=bar"
      )
    ).toBe("https://api.govinfo.gov/packages/CREC-2026-01-17/summary?foo=bar");
  });

  it("leaves URLs without api_key unchanged", () => {
    const url = "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml";
    expect(sanitizeRequestUrlForStorage(url)).toBe(url);
  });
});
