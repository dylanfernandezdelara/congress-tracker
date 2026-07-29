import { describe, expect, it, vi } from "vitest";
import { buildRecentConfirmations } from "./recent-confirmations";

vi.mock("../d1/confirmation-votes", () => ({
  selectRecentConfirmationVotes: vi.fn(async () => [
    {
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
      raw_background_text: "Jane Doe, of California, to be Secretary of Energy.",
      background_json: JSON.stringify({
        headline: "Jane Doe confirmed as Energy Secretary",
        what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
        background: "Jane Doe of California was nominated to lead the Department of Energy.",
        key_points: ["Cabinet-level confirmation"],
      }),
    },
  ]),
}));

describe("buildRecentConfirmations", () => {
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
      background: "Jane Doe of California was nominated to lead the Department of Energy.",
      yeas: 58,
      nays: 40,
      congress_gov_url: "https://www.congress.gov/nomination/119th-congress/100",
    });
  });
});
