/**
 * Shared UTC lookback window helpers.
 *
 * Two call sites historically used different day-count semantics:
 * - Feed / Congress.gov vote lookback subtracted `days` from today
 *   (`today - days`), which is an inclusive window of `days + 1` calendar days.
 * - Notable-votes lookback subtracted `days - 1`, which is an inclusive window
 *   of exactly `days` calendar days.
 *
 * Prefer {@link inclusiveLookbackStartIso} with an explicit inclusive day count.
 * Use {@link daysAgoLookbackStartIso} only when preserving the legacy
 * "subtract N days" feed/vote window.
 */

/** Inclusive UTC start date (YYYY-MM-DD): `asOf` plus the prior `inclusiveDays - 1` days. */
export function inclusiveLookbackStartIso(
  inclusiveDays: number,
  asOf: Date = new Date(),
): string {
  const d = new Date(asOf)
  d.setUTCDate(d.getUTCDate() - (inclusiveDays - 1))
  return d.toISOString().slice(0, 10)
}

/**
 * Legacy "days ago" start date (YYYY-MM-DD): `asOf` minus `days`.
 * Equivalent to {@link inclusiveLookbackStartIso} with `inclusiveDays = days + 1`.
 */
export function daysAgoLookbackStartIso(days: number, asOf: Date = new Date()): string {
  return inclusiveLookbackStartIso(days + 1, asOf)
}
