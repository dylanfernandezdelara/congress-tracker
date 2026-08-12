import { describe, expect, it } from "vitest";
import { extractCommitteeTally, parseCommitteeEvents } from "./parse-committee-source";

describe("parse-committee-source", () => {
  it("extracts committee tallies from action text", () => {
    expect(
      extractCommitteeTally("Ordered to be Reported (Amended) by the Yeas and Nays: 47 - 0.")
    ).toBe("47-0");
    expect(extractCommitteeTally("Forwarded by Subcommittee to Full Committee by Voice Vote.")).toBe(
      "voice vote"
    );
  });

  it("parses standing and subcommittee activities", () => {
    const events = parseCommitteeEvents({
      congress: 119,
      billType: "hr",
      billNumber: 1,
      committees: [
        {
          name: "Energy and Commerce Committee",
          systemCode: "hsif00",
          chamber: "House",
          activities: [
            { name: "Referred To", date: "2023-03-29T15:00:25Z" },
            { name: "Reported By", date: "2023-12-12T21:27:15Z" },
          ],
          subcommittees: [
            {
              name: "Health Subcommittee",
              systemCode: "hsif14",
              activities: [
                { name: "Referred to", date: "2023-04-07T16:55:03Z" },
                { name: "Reported by", date: "2023-07-13T17:01:58Z" },
              ],
            },
          ],
        },
      ],
      actions: [
        {
          actionDate: "2023-12-06",
          text: "Ordered to be Reported (Amended) by the Yeas and Nays: 47 - 0.",
          committees: [{ name: "Energy and Commerce Committee" }],
        },
      ],
    });

    expect(events.some((e) => e.activityKey === "sent" && e.systemCode === "hsif14")).toBe(true);
    expect(events.some((e) => e.activityKey === "advanced" && e.parentSystemCode === "hsif00")).toBe(
      true
    );
    const reported = events.find(
      (e) => e.systemCode === "hsif00" && e.activityKey === "advanced"
    );
    expect(reported?.tallyText).toBe("47-0");
  });
});
