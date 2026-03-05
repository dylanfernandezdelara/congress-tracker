import { describe, expect, it } from "vitest";
import {
  computeConfidenceCalibrationSummary,
  computeQuoteValidationSummary,
} from "./analysis-validation";
import type { BillAnalysis, BillImpactEvidence } from "./types";

describe("analysis-validation", () => {
  it("calculates quote validity against impact evidence corpus", () => {
    const analysis: BillAnalysis = {
      plain_title: "Test",
      plain_summary: "Test summary",
      key_provisions: [],
      why_it_matters: "test",
      hidden_provisions: null,
      significance: "medium",
      significance_reason: "test",
      category: "Testing",
      affects: [],
      claims: [
        {
          text: "Claim one",
          evidence_refs: [
            {
              source_endpoint: "summary",
              source_ref: "summary_evidence:1",
              quote: "The bill nullifies an earlier local tax measure.",
            },
            {
              source_endpoint: "summary",
              source_ref: "summary_evidence:2",
              quote: "This quote does not appear in evidence.",
            },
          ],
        },
      ],
    };
    const impactEvidence: BillImpactEvidence = {
      schema_version: 1,
      bill_key: "119-hjres-142",
      congress: 119,
      session: 2,
      generated_at: "2026-02-20T00:00:00Z",
      source_availability: { summaries: true },
      who: [],
      what: [],
      how_much: [],
      when: [],
      where: { geography_scope: "state-named", states_mentioned: ["DC"] },
      unknowns: [],
      richness_score: 20,
      summary_evidence: [
        "The bill nullifies an earlier local tax measure and reinstates prior provisions.",
      ],
    };

    const summary = computeQuoteValidationSummary(analysis, impactEvidence);
    expect(summary.totalQuotes).toBe(2);
    expect(summary.validQuotes).toBe(1);
    expect(summary.invalidQuotes).toBe(1);
    expect(summary.pctValid).toBe(50);
  });

  it("flags confidence calibration mismatches for low-evidence analyses", () => {
    const analysis: BillAnalysis = {
      plain_title: "Calibration Test",
      plain_summary: "Calibration summary",
      key_provisions: [],
      why_it_matters: "test",
      hidden_provisions: null,
      significance: "medium",
      significance_reason: "test",
      category: "Testing",
      affects: [],
      confidence: "high",
      analysis_quality: {
        evidence_coverage: "minimal",
        inference_used: true,
        confidence_reason: "Limited evidence.",
      },
      likely_reasons: [
        {
          actor: "D",
          category: "federalism",
          reason: "Likely concern over federal override.",
          confidence: "medium",
          inference_label: "inference",
          evidence_refs: [{ source_endpoint: "summary", source_ref: "summary_evidence:1" }],
        },
      ],
    };

    const summary = computeConfidenceCalibrationSummary(analysis);
    expect(summary.evaluatedCount).toBe(2);
    expect(summary.mismatchCount).toBe(2);
    expect(summary.mismatchPct).toBe(100);
  });
});

