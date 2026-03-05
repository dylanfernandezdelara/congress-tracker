import { describe, expect, it } from "vitest";
import { extractPolicyDeltas } from "./policy-delta-extract";

describe("extractPolicyDeltas", () => {
  it("extracts nullify and reinstate policy deltas with evidence refs", () => {
    const sourceText = [
      "<p>This joint resolution nullifies legislation enacted by the Council of the District of Columbia.</p>",
      "The nullification reinstates certain DC tax code provisions that were in place before enactment.",
    ];
    const deltas = extractPolicyDeltas(sourceText);

    expect(deltas.length).toBeGreaterThanOrEqual(2);
    expect(deltas.some((delta) => delta.action === "nullify")).toBe(true);
    expect(deltas.some((delta) => delta.action === "reinstate")).toBe(true);
    expect(deltas.every((delta) => delta.evidence_refs.length > 0)).toBe(true);
    expect(deltas.every((delta) => delta.evidence_refs[0].source_ref.startsWith("source_text:"))).toBe(true);
  });

  it("deduplicates repeated policy delta statements", () => {
    const sourceText = [
      "The bill restores a prior standard deduction rule.",
      "The bill restores a prior standard deduction rule.",
    ];
    const deltas = extractPolicyDeltas(sourceText);

    expect(deltas.length).toBe(1);
    expect(deltas[0].action).toBe("restore");
  });
});

