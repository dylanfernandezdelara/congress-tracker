// Floor activity command implementation

use anyhow::Result;
use chrono::NaiveDate;

use crate::cli::output::print_events;
use crate::config::Config;
use crate::sources::senate_xml::try_fetch_floor_activity_events;

/// Run the floor command: show floor activity for a date.
///
/// This fetches floor activity events for the given date. If no floor activity
/// data is available (e.g., weekends, recesses), it displays a friendly message.
///
/// # Arguments
/// * `config` - Application configuration
/// * `date` - Date to fetch floor activity for
/// * `json` - Whether to output in JSON format (true) or table format (false)
pub async fn run_floor_command(
    config: &Config,
    date: NaiveDate,
    json: bool,
) -> Result<()> {
    // Try to fetch floor activity events
    match try_fetch_floor_activity_events(config, date).await {
        Some(events) => {
            // Display the results
            print_events(&events, json);
        }
        None => {
            // No floor activity data available for this date
            if json {
                println!("[]");
            } else {
                println!("No floor activity data available for {}.", date);
            }
        }
    }

    Ok(())
}
