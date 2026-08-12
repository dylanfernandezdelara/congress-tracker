import { describe, expect, it, vi } from "vitest";

vi.mock("./http", () => ({
  fetchJsonWithMeta: vi.fn(),
}));

import { fetchJsonWithMeta } from "./http";
import { fetchCongressCommitteeRoster } from "./congress-client";

describe("fetchCongressCommitteeRoster", () => {
  it("keeps nested subcommittee parent links and ignores top-level subcommittee rows", async () => {
    vi.mocked(fetchJsonWithMeta).mockResolvedValue({
      data: {
        committees: [
          {
            systemCode: "ssju00",
            name: "Committee on the Judiciary",
            chamber: "Senate",
            committeeTypeCode: "Standing",
            subcommittees: [
              {
                systemCode: "ssju01",
                name: "Subcommittee on Crime and Counterterrorism",
              },
            ],
          },
          {
            systemCode: "ssju01",
            name: "Subcommittee on Crime and Counterterrorism",
            chamber: "Senate",
            committeeTypeCode: "Subcommittee",
            subcommittees: [],
          },
        ],
      },
      rateLimitRemaining: null,
    } as never);

    const rows = await fetchCongressCommitteeRoster(
      { CONGRESS_API_KEY: "test" } as never,
      119
    );

    expect(rows).toEqual([
      {
        systemCode: "ssju00",
        chamber: "Senate",
        name: "Committee on the Judiciary",
        committeeType: "Standing",
        parentSystemCode: null,
      },
      {
        systemCode: "ssju01",
        chamber: "Senate",
        name: "Subcommittee on Crime and Counterterrorism",
        committeeType: "Subcommittee",
        parentSystemCode: "ssju00",
      },
    ]);
  });
});
