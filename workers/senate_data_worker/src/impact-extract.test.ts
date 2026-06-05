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
  });

  it("builds trend snapshot with totals", () => {
    const impact = extractBillImpactEvidence(bill, rawEvidence, { session: 2 });
    const trend = buildTrendSnapshot(bill, impact, "2026-02-18");
    expect(trend.bill_key).toBe("119-s-210");
    expect(trend.amount_total_nominal).toBeGreaterThan(0);
    expect(trend.snapshot_date).toBe("2026-02-18");
  });

  it("detects state abbreviations and records unknowns for sparse evidence", () => {
    const sparseEvidence: BillEvidenceRaw = {
      ...rawEvidence,
      source_text: [
        "Authorizes pilot support for local entities in CA and TX.",
      ],
      source_availability: {
        summaries: true,
        detail: false,
        cbo_cost_estimates: false,
      },
    };

    const impact = extractBillImpactEvidence(bill, sparseEvidence, { session: 2 });
    expect(impact.where.states_mentioned).toEqual(expect.arrayContaining(["CA", "TX"]));
    expect(impact.unknowns.length).toBeGreaterThan(0);
  });

  it("captures policy deltas for governance-style text without fiscal amounts", () => {
    const governanceBill: BillRef = {
      congress: 119,
      type: "H.J.RES.",
      number: "142",
      title: "Disapproving D.C. tax conformity action",
      summary:
        "This joint resolution nullifies a District of Columbia tax measure and reinstates prior tax code provisions.",
      policy_area: "Government Operations and Politics",
    };
    const governanceEvidence: BillEvidenceRaw = {
      ...rawEvidence,
      bill_key: "119-hjres-142",
      bill: {
        congress: 119,
        type: "H.J.RES.",
        number: "142",
        title: governanceBill.title,
        summary: governanceBill.summary,
        policy_area: governanceBill.policy_area,
      },
      source_text: [
        "This joint resolution nullifies legislation enacted by the Council of the District of Columbia.",
        "The nullification reinstates certain DC tax code provisions that were in place before enactment of the DC legislation.",
      ],
    };

    const impact = extractBillImpactEvidence(governanceBill, governanceEvidence, { session: 2 });
    expect((impact.policy_deltas ?? []).length).toBeGreaterThan(0);
    expect((impact.policy_deltas ?? []).some((delta) => delta.action === "nullify")).toBe(true);
    expect((impact.policy_deltas ?? []).some((delta) => delta.action === "reinstate")).toBe(true);
  });
});
