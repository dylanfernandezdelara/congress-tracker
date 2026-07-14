export type BillLawKind =
  | "signed"
  | "law_unsigned"
  | "enacted_over_veto"
  | "vetoed"
  | "pocket_vetoed";

export type BillLifecycleDerivedStatus = "pending_signature" | "law_unsigned_derived";

export interface BillLifecycleDerived {
  status: BillLifecycleDerivedStatus | null;
  /** 1-based day count excluding Sundays, when pending (0 on presentation day). */
  day_of_ten: number | null;
  /** Date the 10-day window (excl Sundays) lapses. */
  deadline_date: string | null;
  /** Date the bill is law if unsigned: the day after the window lapses. */
  becomes_law_on: string | null;
}

export interface BillLifecycle {
  introduced_date: string | null;
  presented_date: string | null;
  signed_date: string | null;
  vetoed_date: string | null;
  /** Formal enactment date from congress.gov. */
  became_law_date: string | null;
  /** Formal law outcome from congress.gov actions. */
  law_kind: BillLawKind | null;
  public_law: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  /** Ten-day-rule fields, computed at read time relative to a provided "today". */
  derived: BillLifecycleDerived;
}
