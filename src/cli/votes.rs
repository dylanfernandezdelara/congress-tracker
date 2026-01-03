// Votes command implementation

use anyhow::{Context, Result};
use chrono::NaiveDate;

use crate::cli::output::print_events;
use crate::config::Config;
use crate::sources::senate_xml::{fetch_vote_events_for_date, filter_votes_by_state};

/// Run the votes command: show votes for a date, filtered by state senators.
///
/// This fetches all votes for the given date, then filters to show only
/// how the senators from the specified state voted.
///
/// # Arguments
/// * `config` - Application configuration
/// * `state` - Two-letter state code (e.g., "CA", "NY")
/// * `date` - Date to fetch votes for
/// * `json` - Whether to output in JSON format (true) or table format (false)
pub async fn run_votes_command(
    config: &Config,
    state: &str,
    date: NaiveDate,
    json: bool,
) -> Result<()> {
    // Fetch all vote events for the date
    let events = fetch_vote_events_for_date(config, date)
        .await
        .with_context(|| format!("Failed to fetch votes for {}", date))?;

    // Handle case where no votes exist for the date
    if events.is_empty() {
        if json {
            println!("[]");
        } else {
            println!("No votes found for {}.", date);
        }
        return Ok(());
    }

    // Filter votes to show only the specified state's senators' positions
    let filtered_events = filter_votes_by_state(&events, state);

    // Display the results
    print_events(&filtered_events, json);

    // If not JSON mode, print a helpful summary showing senator positions
    if !json {
        print_senator_vote_summary(&filtered_events, state);
    }

    Ok(())
}

/// Print a summary of how the state's senators voted on each measure.
fn print_senator_vote_summary(events: &[crate::models::event::Event], state: &str) {
    // Check if we have any votes with senator positions
    let has_votes = events
        .iter()
        .any(|e| e.senator_votes.as_ref().map_or(false, |v| !v.is_empty()));

    if !has_votes {
        return;
    }

    println!();
    println!("=== {} Senators' Votes ===", state.to_uppercase());
    println!();

    for event in events {
        if let Some(ref votes) = event.senator_votes {
            if votes.is_empty() {
                continue;
            }

            // Truncate title for display
            let title = if event.title.len() > 60 {
                format!("{}...", &event.title[..57])
            } else {
                event.title.clone()
            };

            println!("{}:", title);
            for vote in votes {
                println!("  {} ({}): {}", vote.name, vote.party, vote.position);
            }
            println!();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::event::{Event, EventType, SenatorVote, VotePosition, VoteResult};
    use chrono::Utc;

    fn create_test_event(id: &str, title: &str, state_votes: Vec<(&str, &str, VotePosition)>) -> Event {
        let senator_votes: Vec<SenatorVote> = state_votes
            .into_iter()
            .map(|(name, party, position)| SenatorVote {
                bioguide_id: format!("{}_id", name.to_lowercase()),
                name: name.to_string(),
                state: "CA".to_string(),
                party: party.to_string(),
                position,
            })
            .collect();

        Event {
            id: id.to_string(),
            event_type: EventType::Vote,
            title: title.to_string(),
            description: None,
            timestamp: Utc::now(),
            congress: 118,
            session: 2,
            vote_result: Some(VoteResult {
                yeas: 52,
                nays: 48,
                present: 0,
                not_voting: 0,
                passed: true,
            }),
            senator_votes: Some(senator_votes),
            url: None,
        }
    }

    #[test]
    fn test_print_senator_vote_summary_with_votes() {
        let events = vec![create_test_event(
            "vote-1",
            "Test Vote on S.123",
            vec![
                ("Padilla", "D", VotePosition::Yea),
                ("Butler", "D", VotePosition::Yea),
            ],
        )];

        // This just tests that the function doesn't panic
        print_senator_vote_summary(&events, "CA");
    }

    #[test]
    fn test_print_senator_vote_summary_empty_votes() {
        let mut event = create_test_event("vote-1", "Test Vote", vec![]);
        event.senator_votes = Some(vec![]);

        let events = vec![event];

        // Should not panic with empty votes
        print_senator_vote_summary(&events, "CA");
    }

    #[test]
    fn test_print_senator_vote_summary_no_senator_votes() {
        let mut event = create_test_event("vote-1", "Test Vote", vec![]);
        event.senator_votes = None;

        let events = vec![event];

        // Should not panic when senator_votes is None
        print_senator_vote_summary(&events, "CA");
    }
}
