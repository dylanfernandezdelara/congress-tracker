import { describe, expect, it } from "vitest";
import { buildTrendSnapshot, extractBillImpactEvidence } from "./impact-extract";
import type { BillEvidenceRaw, BillRef } from "./types";

describe("extractBillImpactEvidence", () => {
  const bill: BillRef = {
    congress: 119,
    type: "S",
    number: "210",
    title: "Transit Modernization Act",
    summary:
      "Appropriates $2.5 billion for Department of Transportation grants to local transit agencies in New York and California for fiscal year 2026.",
    policy_area: "Transportation",
  };

  const rawEvidence: BillEvidenceRaw = {
    schema_version: 1,
    bill_key: "119-s-210",
    generated_at: "2026-02-18T10:00:00Z",
    bill: {
      congress: 119,
      type: "S",
      number: "210",
      title: bill.title,
      summary: bill.summary,
      policy_area: bill.policy_area,
    },
    endpoints: {
      summaries: {
        tier: 1,
        ok: true,
        fetched_at: "2026-02-18T10:00:00Z",
      },
      detail: {
        tier: 1,
        ok: true,
        fetched_at: "2026-02-18T10:00:00Z",
      },
    },
    source_availability: {
      summaries: true,
      detail: true,
      cbo_cost_estimates: false,
    },
    source_text: [
      "Appropriates $2.5 billion for Department of Transportation grants to local transit agencies in New York and California.",
      "Funding applies in fiscal year 2026 and supports local transit infrastructure.",
    ],
  };

  it("extracts structured amounts, recipients, and geography", () => {
    const impact = extractBillImpactEvidence(bill, rawEvidence, { session: 2 });

    expect(impact.bill_key).toBe("119-s-210");
    expect(impact.how_much.length).toBeGreaterThan(0);
    expect(impact.how_much[0].value_numeric).toBe(2_500_000_000);
    expect(impact.who.length).toBeGreaterThan(0);
    expect(impact.where.states_mentioned).toEqual(expect.arrayContaining(["CA", "NY"]));
    expect(impact.richness_score).toBeGreaterThanOrEqual(60);
  });

  it("builds trend snapshot with totals", () => {
    const impact = extractBillImpactEvidence(bill, rawEvidence, { session: 2 });
    const trend = buildTrendSnapshot(bill, impact, "2026-02-18");
    expect(trend.bill_key).toBe("119-s-210");
    expect(trend.amount_total_nominal).toBeGreaterThan(0);
    expect(trend.snapshot_date).toBe("2026-02-18");
  });
});
