import { describe, expect, it } from "vitest";
import { parseTrumpTruthStatusPage } from "./trumpstruth";
import { HOUSING_SAVE_STATUS_PAGE_HTML } from "../fixtures/executive-housing-save";

describe("parseTrumpTruthStatusPage", () => {
  it("parses housing/SAVE cancellation post", () => {
    const parsed = parseTrumpTruthStatusPage(
      HOUSING_SAVE_STATUS_PAGE_HTML,
      "https://www.trumpstruth.org/statuses/39514"
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe("116805545512296111");
    expect(parsed!.text).toContain("SAVE AMERICA ACT");
    expect(parsed!.text).toContain("cancelled");
    expect(parsed!.sourceUrl).toBe(
      "https://truthsocial.com/@realDonaldTrump/116805545512296111"
    );
  });
});
