import { describe, expect, it } from "vitest";
import { parsePublicLawBill, parsePublicLawsPage } from "./public-laws";

describe("parsePublicLawBill", () => {
  it("parses a Congress.gov law-list row including string bill numbers", () => {
    const law = parsePublicLawBill({
      congress: 119,
      type: "S",
      number: "1003",
      title: "Lulu’s Law",
      latestAction: {
        actionDate: "2026-06-26",
        text: "Became Public Law No: 119-100.",
      },
      laws: [{ number: "119-100", type: "Public Law" }],
    });

    expect(law).toMatchObject({
      congress: 119,
      billType: "S",
      billNumber: 1003,
      title: "Lulu’s Law",
      becameLawDate: "2026-06-26",
      publicLaw: "119-100",
      latestActionText: "Became Public Law No: 119-100.",
    });
    expect(law?.milestones.became_law_date).toBe("2026-06-26");
    expect(law?.milestones.public_law).toBe("119-100");
  });

  it("falls back to action text when laws[] is missing", () => {
    const law = parsePublicLawBill({
      congress: 119,
      type: "hr",
      number: 6644,
      title: "21st Century ROAD to Housing Act",
      latestAction: {
        actionDate: "2026-07-11T00:00:00Z",
        text: "Became Public Law No: 119-101.",
      },
    });

    expect(law).toMatchObject({
      billType: "HR",
      billNumber: 6644,
      becameLawDate: "2026-07-11",
      publicLaw: "119-101",
    });
  });

  it("skips rows without an enactment date or public-law number", () => {
    expect(
      parsePublicLawBill({
        congress: 119,
        type: "S",
        number: 1,
        latestAction: { text: "Became Public Law No: 119-1." },
      })
    ).toBeNull();
    expect(
      parsePublicLawBill({
        congress: 119,
        type: "S",
        number: 1,
        latestAction: { actionDate: "2026-06-01", text: "Signed by President." },
      })
    ).toBeNull();
  });
});

describe("parsePublicLawsPage", () => {
  it("dedupes bills and reads pagination.next", () => {
    const page = parsePublicLawsPage({
      bills: [
        {
          congress: 119,
          type: "S",
          number: 629,
          title: "Emergency Conservation Program Improvement Act of 2025",
          latestAction: {
            actionDate: "2026-07-12",
            text: "Became Public Law No: 119-102.",
          },
          laws: [{ number: "119-102", type: "Public Law" }],
        },
        {
          congress: 119,
          type: "S",
          number: 629,
          title: "Duplicate",
          latestAction: {
            actionDate: "2026-07-12",
            text: "Became Public Law No: 119-102.",
          },
          laws: [{ number: "119-102", type: "Public Law" }],
        },
        { congress: 119, type: "S", number: 1 },
      ],
      pagination: {
        count: 102,
        next: "https://api.congress.gov/v3/law/119/pub?offset=250&limit=250&format=json",
      },
    });

    expect(page.laws).toHaveLength(1);
    expect(page.laws[0]?.billNumber).toBe(629);
    expect(page.nextUrl).toContain("offset=250");
  });
});
