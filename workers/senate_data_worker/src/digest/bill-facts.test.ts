import { describe, expect, it } from "vitest";
import type { CongressAction } from "../lifecycle/parse-actions";
import { billFactsFromActions } from "./bill-facts";

// Shaped like Congress.gov action lists (newest first); wording follows the Library of Congress standard actions.
describe("billFactsFromActions", () => {
  it("S.Res. 905 (119th): agreed to by unanimous consent, with no roll call", () => {
    const actions: CongressAction[] = [
      {
        actionDate: "2026-09-24",
        text: "Submitted in the Senate, considered, and agreed to without amendment and with a preamble by Unanimous Consent.",
      },
      {
        actionDate: "2026-09-24",
        text: "Passed/agreed to in Senate: Submitted in the Senate, considered, and agreed to without amendment and with a preamble by Unanimous Consent.",
      },
    ];
    const facts = billFactsFromActions({ congress: 119, type: "SRES", number: 905 }, actions);
    expect(facts.status).toEqual({ stage: "passed_chamber", label: "Agreed to in the Senate" });
    expect(facts.votes).toEqual([
      expect.objectContaining({ chamber: "Senate", vote_date: "2026-09-24", result: "Passed", yeas: null, nays: null, how: "unanimous_consent" }),
    ]);
  });

  it("H.R. 5334 (119th): both chambers by roll call, House agreed to Senate amendments, signed into law", () => {
    const actions: CongressAction[] = [
      { actionDate: "2026-09-18", text: "Became Public Law No: 119-111." },
      { actionDate: "2026-09-18", text: "Signed by President." },
      { actionDate: "2026-09-17", text: "Presented to President." },
      {
        actionDate: "2026-09-16",
        text: "Resolving differences -- House actions: On motion that the House agree to the Senate amendments Agreed to by the Yeas and Nays: 262 - 159 (Roll no. 308).",
        recordedVotes: [{ chamber: "House", rollNumber: 308 }],
      },
      {
        actionDate: "2026-08-07",
        text: "Passed/agreed to in Senate: Passed Senate with an amendment and an amendment to the Title by Yea-Nay Vote. 61 - 37. Record Vote Number: 224.",
        recordedVotes: [{ chamber: "Senate", rollNumber: 224 }],
      },
      {
        actionDate: "2026-06-10",
        text: "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 220 - 205 (Roll no. 218).",
        recordedVotes: [{ chamber: "House", rollNumber: 218 }],
      },
    ];
    const facts = billFactsFromActions({ congress: 119, type: "HR", number: 5334 }, actions, [{ number: "119-111", type: "Public Law" }]);
    expect(facts.status).toEqual({ stage: "law", label: "Became law (Public Law 119-111)" });
    expect(facts.votes.map((v) => [v.chamber, v.vote_date, v.result, v.yeas, v.nays])).toEqual([
      ["House", "2026-06-10", "Passed", 220, 205],
      ["Senate", "2026-08-07", "Passed", 61, 37],
      ["House", "2026-09-16", "Passed", 262, 159],
    ]);
  });

  it("H.R. 9238 (119th): failed under suspension", () => {
    const facts = billFactsFromActions({ congress: 119, type: "HR", number: 9238 }, [
      {
        actionDate: "2026-06-11",
        text: "Failed of passage/not agreed to in House: On motion to suspend the rules and pass the bill Failed by the Yeas and Nays: (2/3 required): 250 - 170 (Roll no. 221).",
      },
    ]);
    expect(facts.status).toEqual({ stage: "failed", label: "Failed in the House" });
    expect(facts.votes[0]).toMatchObject({ result: "Failed", yeas: 250, nays: 170, how: "roll_call" });
  });

  it("H.Con.Res. 84 (119th): the failed wording has no colon", () => {
    const facts = billFactsFromActions({ congress: 119, type: "HCONRES", number: 84 }, [
      {
        actionDate: "2026-06-04",
        text: "Failed of passage/not agreed to in House On agreeing to the resolution Failed by the Yeas and Nays: 92 - 324, 2 Present (Roll no. 201).",
      },
    ]);
    expect(facts.status).toEqual({ stage: "failed", label: "Failed in the House" });
    expect(facts.votes[0]).toMatchObject({ yeas: 92, nays: 324 });
  });

  it("never reads a Congressional Record page range as a tally", () => {
    const facts = billFactsFromActions({ congress: 119, type: "SRES", number: 905 }, [
      {
        actionDate: "2026-09-24",
        text: "Passed/agreed to in Senate: Submitted in the Senate, considered, and agreed to without amendment and with a preamble by Unanimous Consent. (consideration: CR S8-500)",
      },
    ]);
    expect(facts.votes[0]).toMatchObject({ yeas: null, nays: null, how: "unanimous_consent" });
  });

  it("a bill that passed one chamber by voice vote", () => {
    const facts = billFactsFromActions({ congress: 119, type: "S", number: 100 }, [
      { actionDate: "2026-03-03", text: "Passed/agreed to in Senate: Passed Senate without amendment by Voice Vote." },
    ]);
    expect(facts.status).toEqual({ stage: "passed_chamber", label: "Passed the Senate" });
    expect(facts.votes[0]).toMatchObject({ how: "voice", yeas: null });
  });

  it("does not count a vote on the other chamber's amendments that was not agreed to", () => {
    const facts = billFactsFromActions({ congress: 119, type: "HR", number: 2 }, [
      { actionDate: "2026-04-01", text: "Passed/agreed to in House: On passage Passed by recorded vote: 215 - 210 (Roll no. 99)." },
      { actionDate: "2026-05-01", text: "Resolving differences -- House actions: On motion that the House agree to the Senate amendment Not agreed to by voice vote." },
    ]);
    expect(facts.votes).toHaveLength(1);
  });
});
