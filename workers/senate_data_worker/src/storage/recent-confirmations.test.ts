import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectRecentConfirmationVotes } from "../d1/confirmation-votes";
import { selectMemberVotesForRollKeys } from "../d1/member-votes";
import { hasRealMemberRoster } from "../d1/members";
import { buildRecentConfirmations } from "./recent-confirmations";

vi.mock("../d1/confirmation-votes", () => ({
  selectRecentConfirmationVotes: vi.fn(),
}));
vi.mock("../d1/member-votes", () => ({
  selectMemberVotesForRollKeys: vi.fn(),
}));
vi.mock("../d1/members", () => ({
  hasRealMemberRoster: vi.fn(),
}));

const mockSelect = vi.mocked(selectRecentConfirmationVotes);
const mockMemberVotes = vi.mocked(selectMemberVotesForRollKeys);
const mockHasRoster = vi.mocked(hasRealMemberRoster);

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    chamber: "Senate",
    congress: 119,
    session: 2,
    roll_number: 165,
    nomination_congress: 119,
    nomination_number: 100,
    part_number: 0,
    question: "On the Nomination",
    result: "Confirmed",
    yeas: 58,
    nays: 40,
    vote_date: "2026-07-20",
    citation: "PN100",
    description: "Jane Doe, of California, to be Secretary of Energy.",
    organization: "Department of Energy",
    position_title: "Secretary of Energy",
    nominees_json: JSON.stringify([{ display_name: "Jane Doe", state: "CA" }]),
    raw_background_text:
      "Jane Doe, of California, to be Secretary of Energy.\nPosition: Secretary of Energy (Department of Energy)\nNominee(s): Jane Doe (CA)",
    background_json: JSON.stringify({
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background:
        "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.",
      key_points: [],
      wikipedia_url: null,
      wikipedia_extract: null,
    }),
    ...overrides,
  };
}

describe("buildRecentConfirmations", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockMemberVotes.mockReset();
    mockHasRoster.mockReset();
    mockSelect.mockResolvedValue([sampleRow()] as never);
    mockMemberVotes.mockResolvedValue([]);
    mockHasRoster.mockResolvedValue(false);
  });

  it("maps joined rows into the public confirmations envelope", async () => {
    const env = { DB: {} as D1Database } as import("../config").Env;
    const body = await buildRecentConfirmations(env, 119, 2, 5, "2026-07-28T00:00:00.000Z");
    expect(body.congress).toBe(119);
    expect(body.session).toBe(2);
    expect(body.confirmations).toHaveLength(1);
    expect(body.confirmations[0]).toMatchObject({
      chamber: "Senate",
      citation: "PN100",
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background:
        "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.",
      yeas: 58,
      nays: 40,
      congress_gov_url: "https://www.congress.gov/nomination/119th-congress/100",
      wikipedia_url: null,
      wikipedia_extract: null,
      party_splits: [],
    });
  });

  it("attaches party splits from member votes on the confirmation roll", async () => {
    mockMemberVotes.mockResolvedValue([
      {
        bioguide_id: "S000001",
        party: "R",
        position: "Yea",
        chamber: "Senate",
        congress: 119,
        session: 2,
        roll_number: 165,
      },
      {
        bioguide_id: "S000002",
        party: "R",
        position: "Yea",
        chamber: "Senate",
        congress: 119,
        session: 2,
        roll_number: 165,
      },
      {
        bioguide_id: "S000003",
        party: "D",
        position: "Nay",
        chamber: "Senate",
        congress: 119,
        session: 2,
        roll_number: 165,
      },
      {
        bioguide_id: "S000004",
        party: "D",
        position: "Yea",
        chamber: "Senate",
        congress: 119,
        session: 2,
        roll_number: 165,
      },
    ]);

    const env = { DB: {} as D1Database } as import("../config").Env;
    const body = await buildRecentConfirmations(env, 119, 2, 5, "2026-07-28T00:00:00.000Z");
    expect(body.confirmations[0]?.party_splits).toEqual([
      { party: "D", yeas: 1, nays: 1, party_line: "yea" },
      { party: "R", yeas: 2, nays: 0, party_line: "yea" },
    ]);
  });

  it("surfaces Wikipedia as secondary extract without replacing official About", async () => {
    mockSelect.mockResolvedValue([
      sampleRow({
        background_json: JSON.stringify({
          headline: "Jane Doe confirmed as Energy Secretary",
          what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
          background:
            "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.",
          key_points: [],
          wikipedia_url: "https://en.wikipedia.org/wiki/Jane_Doe_(politician)",
          wikipedia_extract:
            "Jane Doe is an American energy official who previously led state programs.",
        }),
      }),
    ] as never);

    const env = { DB: {} as D1Database } as import("../config").Env;
    const body = await buildRecentConfirmations(env, 119, 2, 5, "2026-07-28T00:00:00.000Z");
    expect(body.confirmations[0]?.background).toBe(
      "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy."
    );
    expect(body.confirmations[0]?.wikipedia_url).toBe(
      "https://en.wikipedia.org/wiki/Jane_Doe_(politician)"
    );
    expect(body.confirmations[0]?.wikipedia_extract).toContain("American energy official");
  });

  it("falls back to an official identity About when rewrite JSON is missing", async () => {
    mockSelect.mockResolvedValue([
      sampleRow({
        background_json: null,
      }),
    ] as never);

    const env = { DB: {} as D1Database } as import("../config").Env;
    const body = await buildRecentConfirmations(env, 119, 2, 5, "2026-07-28T00:00:00.000Z");
    expect(body.confirmations[0]?.background).toBe(
      "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy."
    );
    expect(body.confirmations[0]?.wikipedia_url).toBeNull();
    expect(body.confirmations[0]?.wikipedia_extract).toBeNull();
    expect(body.confirmations[0]?.headline).toBe("Jane Doe confirmed as Secretary of Energy");
  });
});
