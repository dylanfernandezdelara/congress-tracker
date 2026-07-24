import { describe, expect, it } from "vitest";
import { CRS_REWRITE_MAX_CHARS, truncateCrsSummaryForRewrite } from "./crs-truncate";

describe("truncateCrsSummaryForRewrite", () => {
  it("returns short text unchanged (whitespace collapsed)", () => {
    expect(truncateCrsSummaryForRewrite("  Hello   world.  ")).toBe("Hello world.");
  });

  it("cuts at a sentence boundary inside the second half of the window", () => {
    const first = `${"Word ".repeat(200)}.`.replace(/\s+\./, ".");
    const second = ` ${"More ".repeat(200)}.`.replace(/\s+\./, ".");
    const input = `${first.trim()}${second}`;
    expect(input.length).toBeGreaterThan(CRS_REWRITE_MAX_CHARS);

    const out = truncateCrsSummaryForRewrite(input);
    expect(out.length).toBeLessThanOrEqual(CRS_REWRITE_MAX_CHARS);
    expect(out.endsWith(".")).toBe(true);
    expect(out.includes("…")).toBe(false);
    expect(out).toContain("Word");
    expect(out).not.toContain("More");
  });

  it("falls back to a word-boundary ellipsis when no usable sentence end exists", () => {
    const input = "word ".repeat(400).trim();
    const out = truncateCrsSummaryForRewrite(input, 100);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101);
  });

  it("does not treat U.S. abbreviations as sentence boundaries", () => {
    const lead = "Word ".repeat(150).trim();
    const input = `${lead} The act directs the U.S. Department of Energy to publish rules after enactment.`;
    // Cut inside the U.S. clause so a naive ". " search would stop at "U.S."
    const cutBudget = lead.length + " The act directs the U.S. Dep".length;
    const out = truncateCrsSummaryForRewrite(input, cutBudget);
    expect(out.endsWith("U.S.")).toBe(false);
    expect(out.endsWith("…")).toBe(true);
  });
});
