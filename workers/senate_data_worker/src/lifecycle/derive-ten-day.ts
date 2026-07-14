import type { BillLifecycleDerived } from "../../../../shared/lifecycle-api-types";

function toYmd(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function addUtcDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isSunday(ymd: string): boolean {
  return new Date(`${ymd}T12:00:00.000Z`).getUTCDay() === 0;
}

/** Tenth non-Sunday calendar day after `presentedYmd` (exclusive of presentation day). */
export function tenDayDeadlineDate(presentedYmd: string): string {
  let counted = 0;
  let cur = presentedYmd;
  while (counted < 10) {
    cur = addUtcDays(cur, 1);
    if (!isSunday(cur)) counted += 1;
  }
  return cur;
}

/**
 * Count non-Sunday days from the day after `presentedYmd` through `todayYmd` inclusive.
 * Returns 0 when today is on or before the presentation date.
 */
export function nonSundayDaysElapsed(presentedYmd: string, todayYmd: string): number {
  if (todayYmd <= presentedYmd) return 0;
  let count = 0;
  let cur = addUtcDays(presentedYmd, 1);
  while (cur <= todayYmd) {
    if (!isSunday(cur)) count += 1;
    cur = addUtcDays(cur, 1);
  }
  return count;
}

export interface DeriveTenDayInput {
  presentedDate: string | null;
  signedDate: string | null;
  vetoedDate: string | null;
  becameLawDate: string | null;
  /** Injectable clock for tests; defaults to Date.now(). */
  now?: Date | string;
}

/**
 * Article I §7 ten-day rule (excluding Sundays): after presentation, if the
 * President neither signs nor vetoes within 10 non-Sunday days and Congress is
 * in session, the bill becomes law without a signature.
 */
export function deriveTenDayRule(input: DeriveTenDayInput): BillLifecycleDerived {
  const empty: BillLifecycleDerived = {
    status: null,
    day_of_ten: null,
    deadline_date: null,
  };

  if (!input.presentedDate) return empty;
  if (input.signedDate || input.vetoedDate || input.becameLawDate) return empty;

  const presented = toYmd(input.presentedDate);
  const today = toYmd(input.now ?? new Date());
  const deadline = tenDayDeadlineDate(presented);
  const elapsed = nonSundayDaysElapsed(presented, today);

  if (elapsed > 10) {
    return {
      status: "law_unsigned_derived",
      day_of_ten: null,
      deadline_date: deadline,
    };
  }

  return {
    status: "pending_signature",
    day_of_ten: elapsed,
    deadline_date: deadline,
  };
}
