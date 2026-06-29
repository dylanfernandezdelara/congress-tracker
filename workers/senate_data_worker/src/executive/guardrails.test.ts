import { describe, expect, it } from "vitest";
import { applyExecutiveLinkGuardrails, buildExplicitRefExecutiveLink } from "./guardrails";
import {
  HOUSING_SAVE_CATALOG,
  HOUSING_SAVE_LLM_RESULT,
  HOUSING_SAVE_POST_TEXT,
} from "../fixtures/executive-housing-save";

describe("applyExecutiveLinkGuardrails", () => {
  it("links housing post to H.R. 6644 primary and H.R. 22 conditional", () => {
    const result = applyExecutiveLinkGuardrails(
      HOUSING_SAVE_POST_TEXT,
      HOUSING_SAVE_LLM_RESULT,
      HOUSING_SAVE_CATALOG,
      119
    );

    expect(result).not.toBeNull();
    expect(result!.banner_summary).toContain("SAVE");
    expect(result!.linked_bills).toHaveLength(2);

    const primary = result!.linked_bills.find((b) => b.role === "primary");
    const conditional = result!.linked_bills.find((b) => b.role === "conditional");

    expect(primary).toMatchObject({ congress: 119, type: "HR", number: 6644 });
    expect(conditional).toMatchObject({ congress: 119, type: "HR", number: 22 });
  });

  it("rejects S. 2 link when post mentions SAVE America Act", () => {
    const confused = {
      ...HOUSING_SAVE_LLM_RESULT,
      linked_bills: [
        {
          congress: 119,
          type: "S",
          number: 2,
          role: "conditional" as const,
          confidence: 0.9,
          rationale: "wrong bill",
        },
      ],
    };
    const result = applyExecutiveLinkGuardrails(
      HOUSING_SAVE_POST_TEXT,
      confused,
      HOUSING_SAVE_CATALOG,
      119
    );
    expect(result).toBeNull();
  });

  it("rejects bills from the wrong congress", () => {
    const wrongCongress = {
      ...HOUSING_SAVE_LLM_RESULT,
      linked_bills: [
        {
          congress: 118,
          type: "HR",
          number: 1,
          role: "primary" as const,
          confidence: 0.95,
          rationale: "wrong congress",
        },
      ],
    };
    expect(
      applyExecutiveLinkGuardrails(HOUSING_SAVE_POST_TEXT, wrongCongress, HOUSING_SAVE_CATALOG, 119)
    ).toBeNull();
  });

  it("builds explicit-ref links when post names a bill number", () => {
    const result = buildExplicitRefExecutiveLink("I will veto H.R. 9999 if it reaches my desk.", 119);
    expect(result).toMatchObject({
      linked_bills: [{ congress: 119, type: "HR", number: 9999, role: "primary" }],
    });
  });
});
