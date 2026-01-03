// Output formatting utilities

use comfy_table::{presets::UTF8_FULL, Cell, ContentArrangement, Table};

use crate::models::event::Event;
use crate::models::senator::Senator;

/// Format a slice of events as a table string using comfy-table.
///
/// Table columns: Type, Title, Date/Time, Result (for votes)
pub fn format_events_table(events: &[Event]) -> String {
    if events.is_empty() {
        return String::from("No events found.");
    }

    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .set_content_arrangement(ContentArrangement::Dynamic)
        .set_header(vec![
            Cell::new("Type"),
            Cell::new("Title"),
            Cell::new("Date/Time"),
            Cell::new("Result"),
        ]);

    for event in events {
        let event_type = event.event_type.to_string();
        let title = truncate_string(&event.title, 50);
        let datetime = event.timestamp.format("%Y-%m-%d %H:%M").to_string();
        let result = format_vote_result(event);

        table.add_row(vec![
            Cell::new(event_type),
            Cell::new(title),
            Cell::new(datetime),
            Cell::new(result),
        ]);
    }

    table.to_string()
}

/// Format a slice of events as pretty-printed JSON.
pub fn format_events_json(events: &[Event]) -> String {
    serde_json::to_string_pretty(events).unwrap_or_else(|_| String::from("[]"))
}

/// Format a slice of senators as a table string using comfy-table.
///
/// Table columns: Name, State, Party
pub fn format_senators_table(senators: &[Senator]) -> String {
    if senators.is_empty() {
        return String::from("No senators found.");
    }

    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .set_content_arrangement(ContentArrangement::Dynamic)
        .set_header(vec![
            Cell::new("Name"),
            Cell::new("State"),
            Cell::new("Party"),
        ]);

    for senator in senators {
        let party_display = match senator.party {
            crate::models::senator::Party::Democrat => "Democrat (D)",
            crate::models::senator::Party::Republican => "Republican (R)",
            crate::models::senator::Party::Independent => "Independent (I)",
            crate::models::senator::Party::Other => "Other",
        };

        table.add_row(vec![
            Cell::new(&senator.name),
            Cell::new(&senator.state),
            Cell::new(party_display),
        ]);
    }

    table.to_string()
}

/// Format a slice of senators as pretty-printed JSON.
fn format_senators_json(senators: &[Senator]) -> String {
    serde_json::to_string_pretty(senators).unwrap_or_else(|_| String::from("[]"))
}

/// Print events to stdout, routing to either table or JSON format.
///
/// - If `json` is true, prints JSON format
/// - Otherwise, prints a formatted table
pub fn print_events(events: &[Event], json: bool) {
    let output = if json {
        format_events_json(events)
    } else {
        format_events_table(events)
    };
    println!("{}", output);
}

/// Print senators to stdout, routing to either table or JSON format.
///
/// - If `json` is true, prints JSON format
/// - Otherwise, prints a formatted table
pub fn print_senators(senators: &[Senator], json: bool) {
    let output = if json {
        format_senators_json(senators)
    } else {
        format_senators_table(senators)
    };
    println!("{}", output);
}

/// Helper to truncate a string to a maximum length, adding "..." if truncated.
fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

/// Format the vote result for display in the table.
/// Returns a summary string like "Passed (52-48)" or "-" for non-vote events.
fn format_vote_result(event: &Event) -> String {
    match &event.vote_result {
        Some(result) => {
            let status = if result.passed { "Passed" } else { "Failed" };
            format!("{} ({}-{})", status, result.yeas, result.nays)
        }
        None => String::from("-"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::event::{EventType, VoteResult};
    use crate::models::senator::Party;
    use chrono::Utc;

    fn sample_event() -> Event {
        Event {
            id: "vote-1".to_string(),
            event_type: EventType::Vote,
            title: "Motion to proceed to S.123".to_string(),
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
            senator_votes: None,
            url: None,
        }
    }

    fn sample_senator() -> Senator {
        Senator::new("S001191", "Kyrsten Sinema", "AZ", Party::Independent)
    }

    #[test]
    fn test_format_events_table_empty() {
        let result = format_events_table(&[]);
        assert_eq!(result, "No events found.");
    }

    #[test]
    fn test_format_events_table_with_events() {
        let events = vec![sample_event()];
        let result = format_events_table(&events);
        assert!(result.contains("Vote"));
        assert!(result.contains("Motion to proceed"));
        assert!(result.contains("Passed (52-48)"));
    }

    #[test]
    fn test_format_events_json() {
        let events = vec![sample_event()];
        let result = format_events_json(&events);
        assert!(result.contains("\"event_type\": \"vote\""));
        assert!(result.contains("\"yeas\": 52"));
    }

    #[test]
    fn test_format_senators_table_empty() {
        let result = format_senators_table(&[]);
        assert_eq!(result, "No senators found.");
    }

    #[test]
    fn test_format_senators_table_with_senators() {
        let senators = vec![sample_senator()];
        let result = format_senators_table(&senators);
        assert!(result.contains("Kyrsten Sinema"));
        assert!(result.contains("AZ"));
        assert!(result.contains("Independent"));
    }

    #[test]
    fn test_format_senators_json() {
        let senators = vec![sample_senator()];
        let result = format_senators_json(&senators);
        assert!(result.contains("\"name\": \"Kyrsten Sinema\""));
        assert!(result.contains("\"state\": \"AZ\""));
    }

    #[test]
    fn test_truncate_string() {
        assert_eq!(truncate_string("short", 10), "short");
        assert_eq!(truncate_string("this is a very long string", 10), "this is...");
    }
}
