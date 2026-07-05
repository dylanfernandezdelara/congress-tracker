import { describe, expect, it } from "vitest";
import {
  formatDigestFailureMessage,
  inferDigestFailureReason,
} from "./digest-failure";

describe("digest failure helpers", () => {
  it("formats actionable failure copy", () => {
    expect(formatDigestFailureMessage("no_crs_summary")).toBe(
      "Summary ingest failed: no CRS summary. Re-run ingest."
    );
  });

  it("infers rewrite failure when CRS exists without digest", () => {
    expect(
      inferDigestFailureReason({
        digest: null,
        raw_summary_text: "CRS text",
        digest_failure_reason: null,
        bill: { title: "Sample Act" },
        passage_votes: [{}],
      })
    ).toBe("openrouter_rewrite_failed");
  });

  it("uses stored failure reason when present", () => {
    expect(
      inferDigestFailureReason({
        digest: { headline: "Old", what_it_does: "Old" },
        raw_summary_text: "CRS text",
        digest_failure_reason: "openrouter_rewrite_failed",
        bill: { title: "Sample Act" },
        passage_votes: [{}],
      })
    ).toBe("openrouter_rewrite_failed");
  });

  it("reads rewrite budget failures from storage", () => {
    expect(
      inferDigestFailureReason({
        digest: null,
        raw_summary_text: null,
        digest_failure_reason: "rewrite_budget_exhausted",
        bill: { title: "Sample Act" },
        passage_votes: [{}],
      })
    ).toBe("rewrite_budget_exhausted");
  });
});
