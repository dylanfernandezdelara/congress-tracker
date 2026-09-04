import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedItem } from "../types";
import { senateWaitingFromFeed } from "./tightness-stats";

const mockBuildFeedPage = vi.fn();
const mockBuildRecentConfirmations = vi.fn();
const mockSelectMemberVotesForRollKeys = vi.fn();
const mockHasRealMemberRoster = vi.fn();

vi.mock("./feed", () => ({
  buildFeedPage: (...args: unknown[]) => mockBuildFeedPage(...args),
}));

vi.mock("./recent-confirmations", () => ({
  buildRecentConfirmations: (...args: unknown[]) => mockBuildRecentConfirmations(...args),
}));

vi.mock("../d1/member-votes", () => ({
  selectMemberVotesForRollKeys: (...args: unknown[]) => mockSelectMemberVotesForRollKeys(...args),
}));

vi.mock("../d1/members", () => ({
  hasRealMemberRoster: (...args: unknown[]) => mockHasRealMemberRoster(...args),
}));

vi.mock("../d1/schema", () => ({
  ensureSchema: vi.fn(async () => undefined),
}));

function houseItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    bill: { congress: 119, type: "HR", number: 1499, title: "Close resolution" },
    policy_area: null,
    digest: { headline: "House passes a knife-edge resolution", what_it_does: "", key_points: [], terms_explained: [] },
    raw_summary_text: null,
    passage_votes: [
      {
        chamber: "House",
        congress: 119,
        session: 2,
        roll_number: 288,
        question: "On Agreeing to the Resolution",
        result: "Passed",
        yeas: 210,
        nays: 208,
        date: "2026-07-22",
      },
    ],
    latest_passage_date: "2026-07-22",
    latest_activity_date: "2026-07-22",
    lifecycle: null,
    ...overrides,
  };
}

describe("senateWaitingFromFeed", () => {
  it("keeps only in_second_chamber_committee bills and surfaces text-grew", () => {
    const waiting = senateWaitingFromFeed([
      houseItem({
        bill: { congress: 119, type: "HR", number: 1118, title: "Value Over Cost Act" },
        process: {
          current_status: "in_second_chamber_committee",
          current_label: "In Homeland Security and Governmental Affairs Committee · waiting for the committee to act",
          stages: [
            {
              date: "2026-07-22",
              label: "Sent to Homeland Security and Governmental Affairs Committee",
              activity_key: "sent",
              chamber: "Senate",
              committee_name: "Homeland Security and Governmental Affairs Committee",
              system_code: "ssga00",
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: null,
            },
          ],
        },
        text_changes: {
          summary_version: "Reported in House",
          summary_version_date: "2026-02-03",
          latest_version: "Referred in Senate",
          latest_version_date: "2026-07-22",
          added_provisions: [{ label: "3.", heading: "Photo ID" }],
          more_added_count: 0,
        },
      }),
      houseItem({
        process: {
          current_status: "in_committee",
          current_label: "In Energy and Commerce Committee",
          stages: [],
        },
      }),
    ]);

    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({
      bill_type: "HR",
      bill_number: 1118,
      senate_committee: "Homeland Security and Governmental Affairs Committee",
      text_grew: true,
      house_passage_date: "2026-07-22",
    });
  });

  it("drops Senate-origin bills that sit in a House committee", () => {
    const waiting = senateWaitingFromFeed([
      houseItem({
        bill: { congress: 119, type: "S", number: 47, title: "Public lands" },
        process: {
          current_status: "in_second_chamber_committee",
          current_label: "In Energy and Commerce Committee · waiting for the committee to act",
          stages: [
            {
              date: "2026-07-18",
              label: "Sent to Energy and Commerce Committee",
              activity_key: "sent",
              chamber: "House",
              committee_name: "Energy and Commerce Committee",
              system_code: "hsif00",
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: null,
            },
          ],
        },
      }),
      houseItem({
        bill: { congress: 119, type: "HRES", number: 12, title: "House resolution" },
        process: {
          current_status: "in_second_chamber_committee",
          current_label: "In Homeland Security and Governmental Affairs Committee · waiting for the committee to act",
          stages: [
            {
              date: "2026-07-22",
              label: "Sent to Homeland Security and Governmental Affairs Committee",
              activity_key: "sent",
              chamber: "Senate",
              committee_name: "Homeland Security and Governmental Affairs Committee",
              system_code: "ssga00",
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: null,
            },
          ],
        },
      }),
    ]);

    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ bill_type: "HRES", bill_number: 12 });
  });
});

describe("buildTightnessStats", () => {
  beforeEach(() => {
    mockBuildFeedPage.mockReset();
    mockBuildRecentConfirmations.mockReset();
    mockSelectMemberVotesForRollKeys.mockReset();
    mockHasRealMemberRoster.mockReset();
    mockHasRealMemberRoster.mockResolvedValue(false);
  });

  it("splits House passage from Senate bills+nominees and colors cohesion from party splits", async () => {
    const { buildTightnessStats } = await import("./tightness-stats");
    mockBuildFeedPage.mockResolvedValue({
      items: [
        houseItem(),
        houseItem({
          bill: { congress: 119, type: "HR", number: 1118, title: "Value Over Cost Act" },
          digest: {
            headline: "House passes a contracting bill",
            what_it_does: "",
            key_points: [],
            terms_explained: [],
          },
          passage_votes: [
            {
              chamber: "House",
              congress: 119,
              session: 2,
              roll_number: 252,
              question: "On Passage",
              result: "Passed",
              yeas: 421,
              nays: 1,
              date: "2026-07-21",
            },
          ],
        }),
        houseItem({
          bill: { congress: 119, type: "S", number: 47, title: "Public lands" },
          passage_votes: [
            {
              chamber: "Senate",
              congress: 119,
              session: 2,
              roll_number: 9002,
              question: "On Passage of the Bill",
              result: "Passed",
              yeas: 68,
              nays: 32,
              date: "2026-07-18",
            },
          ],
        }),
      ],
      total: 3,
      limit: 50,
      offset: 0,
      has_more: false,
    });
    mockBuildRecentConfirmations.mockResolvedValue({
      congress: 119,
      session: 2,
      as_of: "2026-07-23T00:00:00.000Z",
      confirmations: [
        {
          chamber: "Senate",
          congress: 119,
          session: 2,
          roll_number: 165,
          citation: "PN12",
          nomination_number: 12,
          part_number: 0,
          nominee_names: [{ display_name: "Pam Bondi", state: "FL" }],
          position_title: "Attorney General",
          organization: "Department of Justice",
          description: null,
          question: "On the Nomination",
          result: "Confirmed",
          yeas: 50,
          nays: 49,
          vote_date: "2026-07-20",
          headline: "Pam Bondi confirmed as Attorney General",
          what_was_confirmed: null,
          background: null,
          key_points: [],
          congress_gov_url: "https://www.congress.gov/nomination/119th-congress/12",
          wikipedia_url: null,
          wikipedia_extract: null,
          party_splits: [
            { party: "R", yeas: 50, nays: 2, party_line: "yea" },
            { party: "D", yeas: 0, nays: 47, party_line: "nay" },
          ],
          cross_party_votes: [],
          vote_context: null,
        },
      ],
    });
    mockSelectMemberVotesForRollKeys.mockResolvedValue([
      { chamber: "House", congress: 119, session: 2, roll_number: 288, bioguide_id: "R1", party: "R", position: "Yea" },
      { chamber: "House", congress: 119, session: 2, roll_number: 288, bioguide_id: "R2", party: "R", position: "Yea" },
      { chamber: "House", congress: 119, session: 2, roll_number: 288, bioguide_id: "D1", party: "D", position: "Nay" },
      { chamber: "House", congress: 119, session: 2, roll_number: 288, bioguide_id: "D2", party: "D", position: "Nay" },
      { chamber: "House", congress: 119, session: 2, roll_number: 252, bioguide_id: "R1", party: "R", position: "Yea" },
      { chamber: "House", congress: 119, session: 2, roll_number: 252, bioguide_id: "D1", party: "D", position: "Yea" },
      { chamber: "Senate", congress: 119, session: 2, roll_number: 9002, bioguide_id: "S1", party: "R", position: "Yea" },
      { chamber: "Senate", congress: 119, session: 2, roll_number: 9002, bioguide_id: "S2", party: "D", position: "Yea" },
    ]);

    const body = await buildTightnessStats(
      { DB: {} } as never,
      119,
      2,
      "2026-07-23T00:00:00.000Z"
    );

    expect(body.house_passage).toHaveLength(2);
    const knife = body.house_passage.find((dot) => dot.roll_number === 288);
    const steamroll = body.house_passage.find((dot) => dot.roll_number === 252);
    expect(knife?.kind).toBe("bill");
    expect(knife?.result).toBe("Passed");
    expect(knife?.cohesion).toBe("party-line");
    expect(steamroll?.cohesion).toBe("bipartisan");
    expect(body.senate.map((dot) => dot.kind).sort()).toEqual(["bill", "nominee"]);
    const nominee = body.senate.find((dot) => dot.kind === "nominee");
    expect(nominee?.nominee_name).toBe("Pam Bondi");
    expect(nominee?.cohesion).toBe("party-line");
    expect(mockSelectMemberVotesForRollKeys).toHaveBeenCalledTimes(1);
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includeIntros: false })
    );
  });
});
