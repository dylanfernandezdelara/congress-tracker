import type { AnalyzeBillInput } from "./types-shared";
export function buildPrompt(input: AnalyzeBillInput): string {
  const ref = input.bill;
  const evidence = input.impactEvidence;
  const evidencePayload = evidence
    ? {
        richness_score: evidence.richness_score,
        who: evidence.who.slice(0, 8),
        what: evidence.what.slice(0, 8),
        how_much: evidence.how_much.slice(0, 8),
        when: evidence.when.slice(0, 8),
        where: evidence.where,
        unknowns: evidence.unknowns.slice(0, 8),
        policy_deltas: (evidence.policy_deltas ?? []).slice(0, 8),
        summary_evidence: evidence.summary_evidence.slice(0, 8),
      }
    : null;

  const sponsorSignals = ref.sponsor_party_signals;
  const sponsorContext = sponsorSignals && sponsorSignals.length > 0
    ? `\nSPONSOR/COSPONSOR PARTY SIGNALS:\n${JSON.stringify(sponsorSignals.slice(0, 12), null, 2)}`
    : "";

  return `You are a nonpartisan congressional analyst. Produce a grounded, plain-language synthesis for everyday U.S. readers.

OFFICIAL BILL CONTEXT:
- Title: ${ref.title ?? "N/A"}
- Bill: ${ref.type ?? "N/A"} ${ref.number ?? "N/A"}
- Policy area: ${ref.policy_area ?? "N/A"}
- Summary: ${ref.summary ?? "N/A"}
- Latest action: ${ref.latest_action?.text ?? "N/A"}

STRUCTURED EVIDENCE JSON:
${JSON.stringify(evidencePayload, null, 2)}${sponsorContext}

Return ONLY valid JSON with this structure:
{
  "plain_title": "string",
  "plain_summary": "string",
  "key_provisions": ["string"],
  "money_flows": ["string"],
  "pocketbook_impact": ["string"],
  "state_local_impact": "string",
  "unknowns": ["string"],
  "why_it_matters": "string",
  "hidden_provisions": "string or null",
  "evidence": ["string"],
  "confidence": "high|medium|low",
  "significance": "high|medium|low",
  "significance_reason": "string",
  "category": "string",
  "affects": ["string"],
  "claims": [
    {
      "text": "string",
      "kind": "summary|impact|money|unknown",
      "evidence_refs": [{ "source_endpoint": "string", "source_ref": "string", "quote": "string" }]
    }
  ],
  "party_positions": [
    {
      "party": "D|R|I",
      "stance": "support|oppose|mixed",
      "evidence_points": ["string - factual points from evidence"],
      "inferred_rationale": ["string - labeled reasoning for the stance"],
      "confidence": "high|medium|low"
    }
  ],
  "benefit_map": [
    {
      "group": "string - who benefits, is harmed, or has mixed impact",
      "expected_effect": "benefit|burden|mixed",
      "evidence_refs": [{ "source_endpoint": "string", "source_ref": "string", "quote": "string" }]
    }
  ],
  "stakeholder_impacts": [
    {
      "group": "string",
      "effect": "benefit|burden|mixed",
      "mechanism": "string - short causal mechanism grounded in bill text",
      "confidence": "high|medium|low",
      "evidence_refs": [{ "source_endpoint": "string", "source_ref": "string", "quote": "string" }]
    }
  ],
  "likely_reasons": [
    {
      "actor": "D|R|I|other coalition",
      "category": "fiscal|federalism|labor|business|administrative|legal|other",
      "reason": "string - likely rationale explicitly framed as inference",
      "inference_label": "inference",
      "confidence": "high|medium|low",
      "evidence_refs": [{ "source_endpoint": "string", "source_ref": "string", "quote": "string" }]
    }
  ],
  "analysis_quality": {
    "evidence_coverage": "full|partial|minimal",
    "inference_used": true,
    "confidence_reason": "string"
  }
}

RULES:
- Use only provided official context/evidence. Do not speculate.
- Avoid generic phrases like "sets funding levels" unless followed by concrete details.
- Every claim except kind="unknown" must include >=1 evidence_ref.
- If evidence is missing, state that explicitly in unknowns.
- Keep language neutral and concise.
- For party_positions: evidence_points must be grounded in provided data. inferred_rationale must be clearly labeled reasoning, not presented as fact. If evidence is insufficient, set confidence to "low" and leave inferred_rationale empty.
- For benefit_map: include burden entries when evidence indicates adverse effects. If evidence supports both benefits and harms, include both.
- For benefit_map: each entry must include >=1 evidence_ref with a concrete source_ref. Omit entries you cannot ground.
- For stakeholder_impacts: each impact must include mechanism + confidence + >=1 evidence_ref. Omit ungrounded impacts.
- For likely_reasons: keep reasons nonpartisan and explicitly inferential, include inference_label=\"inference\", and attach >=1 evidence_ref. Omit reasons if evidence is insufficient.
- If you cannot determine a party's position from the evidence, omit that party entirely rather than guessing.`;
}
