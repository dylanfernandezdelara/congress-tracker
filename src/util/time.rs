// Time utilities

use chrono::{DateTime, Datelike, NaiveDate, Utc};
use chrono_tz::America::New_York;

/// Get today's date in US/Eastern timezone
/// 
/// Returns the current date in Eastern time, which is used as the reference
/// for determining "today" for Senate activity queries.
pub fn today_eastern() -> NaiveDate {
    let now_utc: DateTime<Utc> = Utc::now();
    let now_eastern = now_utc.with_timezone(&New_York);
    now_eastern.date_naive()
}

/// Format a date for Senate XML URL patterns
/// 
/// Converts a date to the format used in Senate XML URLs, e.g., "01_20_2015"
/// for January 20, 2015. This format is used in floor activity XML filenames.
/// 
/// # Example
/// ```
/// use chrono::NaiveDate;
/// use daily_senate_update::util::time::format_senate_xml_date;
/// 
/// let date = NaiveDate::from_ymd_opt(2015, 1, 20).unwrap();
/// assert_eq!(format_senate_xml_date(date), "01_20_2015");
/// ```
pub fn format_senate_xml_date(date: NaiveDate) -> String {
    format!("{:02}_{:02}_{}", date.month(), date.day(), date.year())
}

/// Parse a date string in YYYY-MM-DD format
/// 
/// This is useful for parsing date arguments from the CLI.
/// 
/// # Example
/// ```
/// use daily_senate_update::util::time::parse_date;
/// 
/// let date = parse_date("2015-01-20").unwrap();
/// assert_eq!(date.year(), 2015);
/// assert_eq!(date.month(), 1);
/// assert_eq!(date.day(), 20);
/// ```
pub fn parse_date(date_str: &str) -> anyhow::Result<NaiveDate> {
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid date format '{}': {}", date_str, e))
}

