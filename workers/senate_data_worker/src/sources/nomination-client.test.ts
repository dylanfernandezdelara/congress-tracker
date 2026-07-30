import { describe, expect, it } from "vitest";
import {
  buildRawBackgroundText,
  congressGovNominationUrl,
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

  it("includes intro text and Wikipedia extract when present", () => {
    const text = buildRawBackgroundText({
      description: "Jane Doe, of California, to be Secretary of Energy.",
      organization: "Department of Energy",
      positionTitle: "Secretary of Energy",
      introText: "A nomination for cabinet leadership.",
      wikipediaExtract: "Jane Doe is an American energy official.",
      nominees: [{ display_name: "Jane Doe", state: "CA" }],
    });
    expect(text).toContain("A nomination for cabinet leadership.");
    expect(text).toContain("Biography: Jane Doe is an American energy official.");
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
