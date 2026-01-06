import { describe, it, expect } from "vitest";
import {
  parseVoteDate,
  todayEastern,
  compareDates,
  findMaxDateBefore,
} from "./date-parse";

describe("parseVoteDate", () => {
  // Table-driven tests for all supported date formats
  const testCases: Array<{
    input: string | undefined | null;
    congressYear?: number;
    expected: string | null;
    description: string;
  }> = [
    // ISO format
    {
      input: "2025-12-18",
      expected: "2025-12-18",
      description: "ISO format YYYY-MM-DD",
    },
    {
      input: "2024-01-15",
      expected: "2024-01-15",
      description: "ISO format - different date",
    },
    {
      input: "2023-06-01",
      expected: "2023-06-01",
      description: "ISO format - single digit day",
    },

    // Full month name format
    {
      input: "December 18, 2025",
      expected: "2025-12-18",
      description: "Full month name with comma",
    },
    {
      input: "January 5, 2024",
      expected: "2024-01-05",
      description: "Full month name - single digit day",
    },
    {
      input: "February 28, 2024",
      expected: "2024-02-28",
      description: "Full month name - end of month",
    },
    {
      input: "September 15, 2025",
      expected: "2025-09-15",
      description: "Full month name - September",
    },

    // Full month name with time (should strip time)
    {
      input: "December 18, 2025, 02:30 PM",
      expected: "2025-12-18",
      description: "Full month name with time - PM",
    },
    {
      input: "January 15, 2024, 10:45 AM",
      expected: "2024-01-15",
      description: "Full month name with time - AM",
    },
    {
      input: "March 1, 2025, 12:00 PM",
      expected: "2025-03-01",
      description: "Full month name with time - noon",
    },

    // Abbreviated month format
    {
      input: "Dec 18, 2025",
      expected: "2025-12-18",
      description: "Abbreviated month with comma",
    },
    {
      input: "Jan 5, 2024",
      expected: "2024-01-05",
      description: "Abbreviated month - January",
    },
    {
      input: "Sep 15, 2025",
      expected: "2025-09-15",
      description: "Abbreviated month - September",
    },
    {
      input: "Sept 15, 2025",
      expected: "2025-09-15",
      description: "Abbreviated month - Sept variant",
    },

    // US format MM/DD/YYYY
    {
      input: "12/18/2025",
      expected: "2025-12-18",
      description: "US format MM/DD/YYYY",
    },
    {
      input: "1/5/2024",
      expected: "2024-01-05",
      description: "US format - single digit month/day",
    },
    {
      input: "06/01/2023",
      expected: "2023-06-01",
      description: "US format - zero-padded",
    },

    // Short format DD-Mon (requires congressYear)
    {
      input: "18-Dec",
      congressYear: 2025,
      expected: "2025-12-18",
      description: "Short format DD-Mon with year",
    },
    {
      input: "5-Jan",
      congressYear: 2024,
      expected: "2024-01-05",
      description: "Short format - single digit day",
    },
    {
      input: "15-Sep",
      congressYear: 2025,
      expected: "2025-09-15",
      description: "Short format - September",
    },
    {
      input: "18-Dec",
      congressYear: undefined,
      expected: null,
      description: "Short format without year - should fail",
    },

    // Short format Mon DD (requires congressYear)
    {
      input: "Dec 18",
      congressYear: 2025,
      expected: "2025-12-18",
      description: "Short format Mon DD with year",
    },
    {
      input: "Jan 5",
      congressYear: 2024,
      expected: "2024-01-05",
      description: "Short format Mon DD - single digit",
    },

    // Invalid inputs
    {
      input: "",
      expected: null,
      description: "Empty string",
    },
    {
      input: "   ",
      expected: null,
      description: "Whitespace only",
    },
    {
      input: undefined,
      expected: null,
      description: "Undefined",
    },
    {
      input: null,
      expected: null,
      description: "Null",
    },
    {
      input: "invalid",
      expected: null,
      description: "Invalid text",
    },
    {
      input: "2025-13-01",
      expected: null,
      description: "Invalid month (13)",
    },
    {
      input: "2025-02-30",
      expected: null,
      description: "Invalid day (Feb 30)",
    },
    {
      input: "Notamonth 18, 2025",
      expected: null,
      description: "Invalid month name",
    },

    // Edge cases
    {
      input: "  December 18, 2025  ",
      expected: "2025-12-18",
      description: "Leading/trailing whitespace",
    },
    {
      input: "DECEMBER 18, 2025",
      expected: "2025-12-18",
      description: "Uppercase month name",
    },
    {
      input: "december 18, 2025",
      expected: "2025-12-18",
      description: "Lowercase month name",
    },

    // Leap year handling
    {
      input: "February 29, 2024",
      expected: "2024-02-29",
      description: "Leap year - valid Feb 29",
    },
    {
      input: "February 29, 2025",
      expected: null,
      description: "Non-leap year - invalid Feb 29",
    },
  ];

  it.each(testCases)("$description: $input", ({ input, congressYear, expected }) => {
    const result = parseVoteDate(input, congressYear);
    expect(result).toBe(expected);
  });
});

describe("todayEastern", () => {
  it("returns a valid YYYY-MM-DD string", () => {
    const today = todayEastern();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a date in a reasonable range", () => {
    const today = todayEastern();
    const year = parseInt(today.split("-")[0], 10);
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(year).toBeLessThanOrEqual(2030);
  });
});

describe("compareDates", () => {
  const testCases: Array<{
    a: string;
    b: string;
    expectedSign: number;
    description: string;
  }> = [
    { a: "2025-12-18", b: "2025-12-19", expectedSign: -1, description: "a < b" },
    { a: "2025-12-19", b: "2025-12-18", expectedSign: 1, description: "a > b" },
    { a: "2025-12-18", b: "2025-12-18", expectedSign: 0, description: "a == b" },
    { a: "2024-12-18", b: "2025-12-18", expectedSign: -1, description: "different years" },
    { a: "2025-01-18", b: "2025-12-18", expectedSign: -1, description: "different months" },
  ];

  it.each(testCases)("$description", ({ a, b, expectedSign }) => {
    const result = compareDates(a, b);
    if (expectedSign === 0) {
      expect(result).toBe(0);
    } else if (expectedSign < 0) {
      expect(result).toBeLessThan(0);
    } else {
      expect(result).toBeGreaterThan(0);
    }
  });
});

describe("findMaxDateBefore", () => {
  const testCases: Array<{
    dates: string[];
    cutoff: string;
    expected: string | null;
    description: string;
  }> = [
    {
      dates: ["2025-12-16", "2025-12-17", "2025-12-18"],
      cutoff: "2025-12-19",
      expected: "2025-12-18",
      description: "Returns max date before cutoff",
    },
    {
      dates: ["2025-12-16", "2025-12-18", "2025-12-17"],
      cutoff: "2025-12-19",
      expected: "2025-12-18",
      description: "Order doesn't matter",
    },
    {
      dates: ["2025-12-16", "2025-12-17", "2025-12-18"],
      cutoff: "2025-12-18",
      expected: "2025-12-17",
      description: "Cutoff is exclusive",
    },
    {
      dates: ["2025-12-16", "2025-12-17"],
      cutoff: "2025-12-16",
      expected: null,
      description: "No dates before cutoff",
    },
    {
      dates: [],
      cutoff: "2025-12-19",
      expected: null,
      description: "Empty array",
    },
    {
      dates: ["2025-12-18"],
      cutoff: "2025-12-19",
      expected: "2025-12-18",
      description: "Single date before cutoff",
    },
    {
      dates: ["2025-12-19"],
      cutoff: "2025-12-19",
      expected: null,
      description: "Single date equals cutoff (exclusive)",
    },
    {
      dates: ["2025-12-20"],
      cutoff: "2025-12-19",
      expected: null,
      description: "Single date after cutoff",
    },
  ];

  it.each(testCases)("$description", ({ dates, cutoff, expected }) => {
    const result = findMaxDateBefore(dates, cutoff);
    expect(result).toBe(expected);
  });
});

