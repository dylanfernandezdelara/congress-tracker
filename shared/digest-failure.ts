/** Why a bill digest is missing — surfaced in feed UI and ops logs. */

export type DigestFailureReason =
  | "no_crs_summary"
  | "openrouter_rewrite_failed"
  | "rewrite_budget_exhausted"
  | "missing_bill_metadata";

export function formatDigestFailureMessage(reason: DigestFailureReason): string {
  switch (reason) {
    case "no_crs_summary":
      return "Summary ingest failed: no CRS summary. Re-run ingest.";
    case "openrouter_rewrite_failed":
      return "Summary ingest failed: rewrite failed. Re-run ingest.";
    case "rewrite_budget_exhausted":
      return "Summary ingest failed: daily rewrite cap reached. Re-run ingest.";
    case "missing_bill_metadata":
      return "Summary ingest failed: bill metadata missing. Re-run ingest.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function isDigestFailureReason(value: string | null | undefined): value is DigestFailureReason {
  return (
    value === "no_crs_summary" ||
    value === "openrouter_rewrite_failed" ||
    value === "rewrite_budget_exhausted" ||
    value === "missing_bill_metadata"
  );
}

export function inferDigestFailureReason(item: {
  digest: unknown;
  raw_summary_text: string | null;
  digest_failure_reason?: string | null;
  bill: { title: string | null };
  passage_votes: unknown[];
}): DigestFailureReason | null {
  if (isDigestFailureReason(item.digest_failure_reason)) {
    return item.digest_failure_reason;
  }
  if (item.digest) return null;
  if (!item.bill.title && !item.raw_summary_text && item.passage_votes.length === 0) {
    return "missing_bill_metadata";
  }
  if (!item.raw_summary_text?.trim()) return "no_crs_summary";
  return "openrouter_rewrite_failed";
}
