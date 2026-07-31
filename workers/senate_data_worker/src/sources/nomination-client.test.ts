import { describe, expect, it } from "vitest";
import {
  buildRawBackgroundText,
  congressGovNominationUrl,
  parseNominationDescription,
  parseNominationDetail,
} from "./nomination-client";

describe("parseNominationDetail", () => {
  it("extracts description, position, org, and nominee names", () => {
    const bundle = parseNominationDetail({
      nomination: {
        number: 100,
        citation: "PN100",
        description:
          "Jane Doe, of California, to be Secretary of Energy.",
        receivedDate: "2026-01-15",
        nominees: {
          item: {
            organization: "Department of Energy",
            positionTitle: "Secretary of Energy",
            nominees: {
              item: {
                firstName: "Jane",
                lastName: "Doe",
                state: "CA",
              },
            },
          },
        },
      },
    });

    expect(bundle).toMatchObject({
      description: "Jane Doe, of California, to be Secretary of Energy.",
      organization: "Department of Energy",
      positionTitle: "Secretary of Energy",
      receivedDate: "2026-01-15",
      nominees: [{ display_name: "Jane Doe", state: "CA" }],
    });
    expect(bundle.rawBackgroundText).toContain("Secretary of Energy");
    expect(bundle.rawBackgroundText).toContain("Jane Doe (CA)");
  });

  it("reads Congress.gov array position batches and derives names from description", () => {
    const bundle = parseNominationDetail({
      nomination: {
        number: 1092,
        citation: "PN1092",
        description:
          "Walter Clayton, of New York, to be Director of National Intelligence, vice Tulsi Gabbard.",
        receivedDate: "2026-06-01",
        nominees: [
          {
            nomineeCount: 1,
            ordinal: 1,
            organization: "Office of the Director of National Intelligence",
            positionTitle: "Director of National Intelligence",
            url: "https://api.congress.gov/v3/nomination/119/1092/1?format=json",
          },
        ],
      },
    });

    expect(bundle.organization).toBe(
      "Office of the Director of National Intelligence"
    );
    expect(bundle.positionTitle).toBe("Director of National Intelligence");
    expect(bundle.nominees).toEqual([
      { display_name: "Walter Clayton", state: "New York" },
    ]);
    expect(bundle.rawBackgroundText).toContain("Nominee(s): Walter Clayton");
  });
});

describe("parseNominationDescription", () => {
  it("parses name, state, and role from a nomination description", () => {
    expect(
      parseNominationDescription(
        "Antonio M. Pozos, of Pennsylvania, to be United States District Judge for the Eastern District of Pennsylvania, vice Mitchell S. Goldberg, retired."
      )
    ).toEqual({
      nominees: [{ display_name: "Antonio M. Pozos", state: "Pennsylvania" }],
      positionTitle:
        "United States District Judge for the Eastern District of Pennsylvania",
    });
  });
});

describe("buildRawBackgroundText", () => {
  it("returns null when empty", () => {
    expect(
      buildRawBackgroundText({
        description: null,
        organization: null,
        positionTitle: null,
        introText: null,
        nominees: [],
      })
    ).toBeNull();
  });

  it("includes intro text when present", () => {
    const text = buildRawBackgroundText({
      description: "Jane Doe, of California, to be Secretary of Energy.",
      organization: "Department of Energy",
      positionTitle: "Secretary of Energy",
      introText: "A nomination for cabinet leadership.",
      nominees: [{ display_name: "Jane Doe", state: "CA" }],
    });
    expect(text).toContain("A nomination for cabinet leadership.");
    expect(text).not.toContain("Biography:");
  });
});

describe("congressGovNominationUrl", () => {
  it("builds partitioned and plain URLs", () => {
    expect(congressGovNominationUrl({ congress: 119, number: 100, partNumber: 0 })).toBe(
      "https://www.congress.gov/nomination/119th-congress/100"
    );
    expect(congressGovNominationUrl({ congress: 119, number: 851, partNumber: 4 })).toBe(
      "https://www.congress.gov/nomination/119th-congress/851/4"
    );
  });
});
