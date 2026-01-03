// Today command implementation

use anyhow::{Context, Result};
use chrono::NaiveDate;

use crate::cli::output::print_events;
use crate::config::Config;
use crate::sources::senate_xml::{
    fetch_senators_for_state, fetch_vote_events_for_date, filter_votes_by_state,
    try_fetch_floor_activity_events,
};
use crate::util::time::today_eastern;

/// Run the today command: show a chronological timeline of votes and floor activity for a date.
///
/// This aggregates votes and floor activity for the given date, filters votes by state
/// (showing how that state's senators voted), and displays them in chronological order.
///
/// # Arguments
/// * `config` - Application configuration
/// * `state` - Two-letter state code (e.g., "CA", "NY")
/// * `date` - Optional date to fetch events for (defaults to today in Eastern time)
/// * `json` - Whether to output in JSON format (true) or table format (false)
pub async fn run_today_command(
    config: &Config,
    state: &str,
    date: Option<NaiveDate>,
    json: bool,
) -> Result<()> {
    // Resolve date: use provided or default to today_eastern()
    let date = date.unwrap_or_else(today_eastern);

    // Fetch senators for state to validate the state code
    // This will error if the state is invalid
    fetch_senators_for_state(config, state)
        .await
        .with_context(|| format!("Failed to fetch senators for state '{}'", state))?;

    // Fetch votes and floor events in parallel
    let (vote_events_result, floor_events_result) = tokio::try_join!(
        fetch_vote_events_for_date(config, date),
        async {
            match try_fetch_floor_activity_events(config, date).await {
                Some(events) => Ok(events),
                None => Ok(Vec::new()),
            }
        }
    )?;

    // Filter votes by state
    let filtered_vote_events = filter_votes_by_state(&vote_events_result, state);

    // Combine votes and floor events into single Vec<Event>
    let mut all_events = filtered_vote_events;
    all_events.extend(floor_events_result);

    // Sort events by timestamp (chronological order)
    all_events.sort_by_key(|e| e.timestamp);

    // Handle empty event list gracefully
    if all_events.is_empty() {
        if json {
            println!("[]");
        } else {
            println!("No events found for {} on {}.", state.to_uppercase(), date);
        }
        return Ok(());
    }

    // Display using print_events()
    print_events(&all_events, json);

    Ok(())
}
