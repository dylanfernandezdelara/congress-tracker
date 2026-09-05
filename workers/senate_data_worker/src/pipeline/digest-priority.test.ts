import { describe, expect, it } from "vitest";
import { digestMapKey, type DigestRow } from "../d1/digests";
import { orderBillsMissingDigestFirst } from "./digest-priority";

function digestRow(
  congress: number,
  billType: string,
  number: number,
  digestJson: string | null
): DigestRow {
  return {
    congress,
    bill_type: billType,
    number,
    title: "Sample",
    policy_area: "Defense",
    raw_summary_text: null,
    digest_json: digestJson,
  };
}

describe("orderBillsMissingDigestFirst", () => {
  const bills = [
    { bill_congress: 119, bill_type: "HR", bill_number: 1 },
    { bill_congress: 119, bill_type: "HRES", bill_number: 1498 },
    { bill_congress: 119, bill_type: "HR", bill_number: 10216 },
    { bill_congress: 119, bill_type: "S", bill_number: 2 },
  ];

  it("moves bills without a complete digest ahead of rows that already have one", () => {
    const digestByKey = new Map<string, DigestRow | null>([
      [
        digestMapKey(119, "HR", 1),
        digestRow(
          119,
          "HR",
          1,
          JSON.stringify({ headline: "Done", what_it_does: "Complete" })
        ),
      ],
      [digestMapKey(119, "HRES", 1498), digestRow(119, "HRES", 1498, null)],
      [digestMapKey(119, "HR", 10216), null],
      [
        digestMapKey(119, "S", 2),
        digestRow(
          119,
          "S",
          2,
          JSON.stringify({ headline: "Also done", what_it_does: "Complete" })
        ),
      ],
    ]);

    expect(orderBillsMissingDigestFirst(bills, digestByKey)).toEqual([
      { bill_congress: 119, bill_type: "HRES", bill_number: 1498 },
      { bill_congress: 119, bill_type: "HR", bill_number: 10216 },
      { bill_congress: 119, bill_type: "HR", bill_number: 1 },
      { bill_congress: 119, bill_type: "S", bill_number: 2 },
    ]);
  });

  it("treats a missing map entry as incomplete", () => {
    expect(orderBillsMissingDigestFirst(bills, new Map())).toEqual(bills);
  });
});
