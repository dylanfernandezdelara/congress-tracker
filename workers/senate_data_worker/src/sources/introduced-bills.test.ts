import { describe, expect, it } from "vitest";
import {
  isIntroLookbackCandidate,
  looksLikeIntroductionAction,
  looksLikeSameDayReferralAction,
  parseIntroducedBillListItem,
  parseIntroducedBillsPage,
} from "./introduced-bills";

describe("looksLikeIntroductionAction", () => {
  it("accepts introduced and same-day referral phrasing", () => {
    expect(looksLikeIntroductionAction("Introduced in Senate")).toBe(true);
    expect(looksLikeIntroductionAction("Read twice and referred to the Committee on Commerce.")).toBe(
      true
    );
    expect(
      looksLikeIntroductionAction("Referred to the Committee on Energy and Commerce")
    ).toBe(false);
    expect(
      looksLikeSameDayReferralAction("Referred to the Committee on Energy and Commerce")
    ).toBe(true);
    expect(looksLikeIntroductionAction("Passed Senate")).toBe(false);
    expect(looksLikeIntroductionAction(null)).toBe(false);
  });
});

describe("parseIntroducedBillListItem", () => {
  it("reads optional introducedDate from a Congress.gov list row", () => {
    expect(
      parseIntroducedBillListItem({
        congress: 119,
        type: "s",
        number: "9901",
        title: "Ban Artificial Superintelligence Act",
        introducedDate: "2026-09-03",
        latestAction: { actionDate: "2026-09-03", text: "Introduced in Senate" },
      })
    ).toEqual({
      congress: 119,
      type: "S",
      number: 9901,
      title: "Ban Artificial Superintelligence Act",
      introducedDate: "2026-09-03",
      latestActionDate: "2026-09-03",
      latestActionText: "Introduced in Senate",
      policyArea: null,
      primarySponsorBioguide: null,
    });
  });

  it("reads list policyArea and primary sponsor bioguide", () => {
    expect(
      parseIntroducedBillListItem({
        congress: 119,
        type: "s",
        number: 9901,
        title: "Ban Artificial Superintelligence Act",
        policyArea: { name: "Science, Technology, Communications" },
        sponsors: [{ bioguideId: "s000033" }],
      })
    ).toMatchObject({
      policyArea: "Science, Technology, Communications",
      primarySponsorBioguide: "S000033",
    });
  });

  it("returns null when identity is incomplete", () => {
    expect(parseIntroducedBillListItem({ congress: 119, type: "S" })).toBeNull();
  });
});

describe("isIntroLookbackCandidate", () => {
  const lookback = "2026-08-28";

  it("keeps list rows with introducedDate in the window", () => {
    expect(
      isIntroLookbackCandidate(
        {
          congress: 119,
          type: "S",
          number: 1,
          title: "Act",
          introducedDate: "2026-09-01",
          latestActionDate: "2026-09-02",
          latestActionText: "Referred to the Committee on Finance",
          policyArea: null,
          primarySponsorBioguide: null,
        },
        lookback
      )
    ).toBe(true);
  });

  it("drops older introductions even when recently updated", () => {
    expect(
      isIntroLookbackCandidate(
        {
          congress: 119,
          type: "HR",
          number: 1,
          title: "Old Act",
          introducedDate: "2026-01-15",
          latestActionDate: "2026-09-01",
          latestActionText: "Reported by committee",
          policyArea: null,
          primarySponsorBioguide: null,
        },
        lookback
      )
    ).toBe(false);
  });

  it("keeps missing introducedDate when latest action looks like a filing", () => {
    expect(
      isIntroLookbackCandidate(
        {
          congress: 119,
          type: "S",
          number: 2,
          title: "Act",
          introducedDate: null,
          latestActionDate: "2026-09-01",
          latestActionText: "Introduced in Senate",
          policyArea: null,
          primarySponsorBioguide: null,
        },
        lookback
      )
    ).toBe(true);
  });
});

describe("parseIntroducedBillsPage", () => {
  it("walks bills and pagination.next", () => {
    const page = parseIntroducedBillsPage({
      bills: [
        {
          congress: 119,
          type: "HR",
          number: 10,
          title: "House Act",
          introducedDate: "2026-09-01",
        },
        { congress: 119, type: "HR" },
      ],
      pagination: { next: "https://api.congress.gov/v3/bill/119/hr?offset=250" },
    });
    expect(page.bills).toHaveLength(1);
    expect(page.bills[0]?.number).toBe(10);
    expect(page.nextUrl).toContain("offset=250");
  });
});
