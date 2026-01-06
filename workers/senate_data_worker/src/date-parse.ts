/**
 * Date parsing utilities for Senate XML data.
 *
 * Handles the various date formats found in Senate vote XML:
 * - YYYY-MM-DD (ISO format)
 * - December 18, 2025 (full month name)
 * - December 18, 2025, 02:30 PM (with time - strip time)
 * - Dec 18, 2025 (abbreviated month)
 * - 12/18/2025 (US format)
 * - 18-Dec (short format, requires congress_year)
 */

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Parse a date string from Senate XML into a YYYY-MM-DD string.
 *
 * @param dateStr - The date string to parse
 * @param congressYear - Optional year to use for short formats like "18-Dec"
 * @returns The parsed date as YYYY-MM-DD, or null if parsing fails
 */
export function parseVoteDate(
  dateStr: string | undefined | null,
  congressYear?: number
): string | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Try ISO format first: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (isValidDate(+year, +month, +day)) {
      return `${year}-${month}-${day}`;
    }
  }

  // Try "Month Day, Year" or "Month Day, Year, Time" format
  // e.g., "December 18, 2025" or "December 18, 2025, 02:30 PM"
  const fullMonthMatch = trimmed.match(
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:,.*)?$/
  );
  if (fullMonthMatch) {
    const [, monthName, day, year] = fullMonthMatch;
    const month = MONTH_NAMES[monthName.toLowerCase()];
    if (month && isValidDate(+year, month, +day)) {
      return formatDate(+year, month, +day);
    }
  }

  // Try "MM/DD/YYYY" format
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    if (isValidDate(+year, +month, +day)) {
      return formatDate(+year, +month, +day);
    }
  }

  // Try "DD-Mon" format (requires congressYear)
  // e.g., "18-Dec"
  if (congressYear) {
    const shortMatch = trimmed.match(/^(\d{1,2})-([A-Za-z]+)$/);
    if (shortMatch) {
      const [, day, monthName] = shortMatch;
      const month = MONTH_NAMES[monthName.toLowerCase()];
      if (month && isValidDate(congressYear, month, +day)) {
        return formatDate(congressYear, month, +day);
      }
    }

    // Try "Mon DD" format (requires congressYear)
    // e.g., "Dec 18"
    const shortMatch2 = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (shortMatch2) {
      const [, monthName, day] = shortMatch2;
      const month = MONTH_NAMES[monthName.toLowerCase()];
      if (month && isValidDate(congressYear, month, +day)) {
        return formatDate(congressYear, month, +day);
      }
    }
  }

  return null;
}

/**
 * Validate that the date components form a valid date.
 */
function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Check days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/**
 * Format date components as YYYY-MM-DD.
 */
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Get today's date in US Eastern timezone as YYYY-MM-DD.
 *
 * This is the cutoff date for determining which vote day to target.
 */
export function todayEastern(): string {
  const now = new Date();

  // Create formatter for Eastern time
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Format returns YYYY-MM-DD in en-CA locale
  return formatter.format(now);
}

/**
 * Compare two YYYY-MM-DD date strings.
 *
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Find the maximum date from an array that is strictly less than the cutoff.
 *
 * @param dates - Array of YYYY-MM-DD date strings
 * @param cutoff - The cutoff date (exclusive)
 * @returns The max date < cutoff, or null if none found
 */
export function findMaxDateBefore(
  dates: string[],
  cutoff: string
): string | null {
  let maxDate: string | null = null;

  for (const date of dates) {
    if (compareDates(date, cutoff) < 0) {
      if (maxDate === null || compareDates(date, maxDate) > 0) {
        maxDate = date;
      }
    }
  }

  return maxDate;
}

