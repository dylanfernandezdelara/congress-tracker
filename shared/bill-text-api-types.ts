/** Shared JSON contracts for bill text-version comparison — worker + web. */

/** One section present in the newest bill text but absent from the summarized text. */
export interface BillAddedProvision {
  /** Section enum as printed in the bill, e.g. `3.` or `303A.`. */
  label: string
  /** Section heading, e.g. `Requiring voters to provide photo identification`. */
  heading: string
}

/**
 * Difference between the bill version our plain-English summary describes and
 * the newest published text. Present only when the newest text adds sections,
 * so a version relabel (e.g. `Referred in Senate`) never produces a callout.
 */
export interface BillTextChanges {
  /** Congress.gov version label the CRS summary describes, e.g. `Reported in House`. */
  summary_version: string | null
  /** ISO date (YYYY-MM-DD) of the summarized version. */
  summary_version_date: string | null
  /** Newest published version label, e.g. `Engrossed in House`. */
  latest_version: string
  /** ISO date (YYYY-MM-DD) of the newest published version. */
  latest_version_date: string
  /**
   * Provisions in the newest text with no counterpart in the summarized text.
   * Matched heading-first; section numbers are not stable identities and are
   * only a fallback when a heading was reworded in place.
   */
  added_provisions: BillAddedProvision[]
  /** Added sections beyond those listed in `added_provisions`. */
  more_added_count: number
}
