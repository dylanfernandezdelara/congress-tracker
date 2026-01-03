//! Senate XML data source.
//!
//! Phase 2A: Fetch/parse Senate member data into [`Senator`].
//!
//! The plan references `cvc_member_data.xml` (via [`Config::senate_member_data_url()`]). In some
//! environments that endpoint may redirect to HTML. When that happens, we fall back to the Senate’s
//! stable contact-information feed, which includes `bioguide_id`, `state`, `party`, and names.

use std::collections::HashSet;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::{NaiveDate, TimeZone, Utc};
use chrono_tz::America::New_York;
use quick_xml::de::from_str;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Deserialize;

use crate::config::Config;
use crate::models::event::{Event as SenateEvent, EventType};
use crate::models::senator::{Party, Senator};
use crate::util::time::format_senate_xml_date;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(20);

/// Stable Senate XML feed of current senators (contact information).
const SENATE_CONTACT_INFO_XML_URL: &str =
    "https://www.senate.gov/general/contact_information/senators_cfm.xml";

#[derive(Debug, Default)]
struct MemberFields {
    bioguide_id: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    member_full: Option<String>,
    state: Option<String>,
    party: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Field {
    BioguideId,
    FirstName,
    LastName,
    MemberFull,
    State,
    Party,
}

/// Fetch the raw Senate member XML.
///
/// Tries `Config::senate_member_data_url()` first, then falls back to
/// [`SENATE_CONTACT_INFO_XML_URL`] if the primary endpoint is unavailable or returns HTML.
pub async fn fetch_member_data_xml(config: &Config) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(DEFAULT_TIMEOUT)
        .user_agent("daily_senate_update/0.1")
        .build()
        .context("Failed to build HTTP client")?;

    let primary_url = config.senate_member_data_url();
    match fetch_xml_like_text(&client, &primary_url).await {
        Ok(xml) => Ok(xml),
        Err(primary_err) => fetch_xml_like_text(&client, SENATE_CONTACT_INFO_XML_URL)
            .await
            .with_context(|| {
                format!(
                    "Primary member data fetch failed ({primary_url}): {primary_err:#}. \
                     Fallback fetch also failed ({SENATE_CONTACT_INFO_XML_URL})."
                )
            }),
    }
}

/// Fetch and parse the current list of senators.
pub async fn fetch_senators(config: &Config) -> Result<Vec<Senator>> {
    let xml = fetch_member_data_xml(config).await?;
    parse_senators_from_member_data_xml(&xml)
}

/// Fetch the two current senators for a given state (e.g. `"AZ"`).
pub async fn fetch_senators_for_state(config: &Config, state: &str) -> Result<[Senator; 2]> {
    let senators = fetch_senators(config).await?;
    senators_for_state(&senators, state)
}

/// Parse Senate member XML into `Vec<Senator>`.
///
/// This is intentionally tolerant: it scans for repeating `<member>...</member>` elements and
/// extracts a minimal subset of fields.
pub fn parse_senators_from_member_data_xml(xml: &str) -> Result<Vec<Senator>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut current_member: Option<MemberFields> = None;
    let mut current_field: Option<Field> = None;

    let mut seen_bioguide_ids: HashSet<String> = HashSet::new();
    let mut out: Vec<Senator> = Vec::new();

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .context("Failed reading member XML")?;

        match event {
            Event::Start(e) => match e.name().as_ref() {
                b"member" => {
                    current_member = Some(MemberFields::default());
                    current_field = None;
                }
                b"bioguide_id" => current_field = Some(Field::BioguideId),
                b"first_name" => current_field = Some(Field::FirstName),
                b"last_name" => current_field = Some(Field::LastName),
                b"member_full" => current_field = Some(Field::MemberFull),
                b"state" => current_field = Some(Field::State),
                b"party" => current_field = Some(Field::Party),
                _ => current_field = None,
            },
            Event::Text(e) => {
                if let (Some(member), Some(field)) = (current_member.as_mut(), current_field) {
                    let text = e.unescape().context("Failed to unescape member XML text")?;
                    let text = text.trim();
                    if !text.is_empty() {
                        match field {
                            Field::BioguideId => member.bioguide_id = Some(text.to_string()),
                            Field::FirstName => member.first_name = Some(text.to_string()),
                            Field::LastName => member.last_name = Some(text.to_string()),
                            Field::MemberFull => member.member_full = Some(text.to_string()),
                            Field::State => member.state = Some(text.to_string()),
                            Field::Party => member.party = Some(text.to_string()),
                        }
                    }
                }
            }
            Event::End(e) => {
                current_field = None;

                if e.name().as_ref() == b"member" {
                    if let Some(member) = current_member.take() {
                        if let Some(senator) = member_fields_to_senator(member)? {
                            if seen_bioguide_ids.insert(senator.bioguide_id.clone()) {
                                out.push(senator);
                            }
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }

        buf.clear();
    }

    if out.is_empty() {
        anyhow::bail!("Parsed 0 senators from member XML (unexpected schema)");
    }

    Ok(out)
}

/// Return the 2 senators for a given state from a parsed senator list.
pub fn senators_for_state(all: &[Senator], state: &str) -> Result<[Senator; 2]> {
    let st = state.trim().to_uppercase();
    if st.len() != 2 {
        anyhow::bail!("State must be a 2-letter abbreviation (got '{state}')");
    }

    let mut matches: Vec<Senator> = all
        .iter()
        .filter(|s| s.state.eq_ignore_ascii_case(&st))
        .cloned()
        .collect();

    matches.sort_by(|a, b| a.name.cmp(&b.name));
    matches.dedup_by(|a, b| a.bioguide_id == b.bioguide_id);

    match matches.len() {
        2 => Ok([matches.remove(0), matches.remove(0)]),
        0 => anyhow::bail!("No senators found for state '{st}'"),
        1 => anyhow::bail!("Only 1 senator found for state '{st}' (expected 2)"),
        n => anyhow::bail!("Found {n} senators for state '{st}' (expected 2)"),
    }
}

async fn fetch_xml_like_text(client: &reqwest::Client, url: &str) -> Result<String> {
    let resp = client
        .get(url)
        .header(reqwest::header::ACCEPT, "text/xml, application/xml;q=0.9, */*;q=0.1")
        .send()
        .await
        .with_context(|| format!("HTTP request failed: GET {url}"))?;

    let status = resp.status();
    let headers = resp.headers().clone();
    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let text = resp
        .text()
        .await
        .with_context(|| format!("Failed reading response body: GET {url}"))?;

    if !status.is_success() {
        anyhow::bail!("Non-success HTTP status for GET {url}: {status}");
    }

    let trimmed = text.trim_start();
    let looks_like_html = trimmed.starts_with("<!DOCTYPE html")
        || trimmed.starts_with("<html")
        || trimmed.contains("Request not Accepted - Security Risk Detected")
        || trimmed.contains("<title>U.S. Senate: 404 Error Page</title>");

    let looks_like_xml = trimmed.starts_with("<?xml")
        || trimmed.starts_with("<contact_information")
        || trimmed.starts_with("<CVC_MEMBER_DATA")
        || trimmed.starts_with("<members");

    if looks_like_html || (!looks_like_xml && !content_type.contains("xml")) {
        anyhow::bail!(
            "Response from {url} did not look like XML (content-type: '{content_type}')"
        );
    }

    Ok(text)
}

fn member_fields_to_senator(m: MemberFields) -> Result<Option<Senator>> {
    let bioguide_id = match m.bioguide_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(id) => id.to_string(),
        None => return Ok(None),
    };

    let state = match m.state.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(st) => st.to_uppercase(),
        None => return Ok(None),
    };

    if state.len() != 2 {
        return Ok(None);
    }

    let party = m.party.as_deref().map(parse_party).unwrap_or(Party::Other);

    let name = build_member_name(m.first_name.as_deref(), m.last_name.as_deref(), m.member_full.as_deref())
        .ok_or_else(|| anyhow::anyhow!("Missing senator name fields for bioguide_id={bioguide_id}"))?;

    Ok(Some(Senator::new(bioguide_id, name, state, party)))
}

fn build_member_name(first: Option<&str>, last: Option<&str>, member_full: Option<&str>) -> Option<String> {
    let first = first.map(str::trim).filter(|s| !s.is_empty());
    let last = last.map(str::trim).filter(|s| !s.is_empty());

    if first.is_some() || last.is_some() {
        let mut out = String::new();
        if let Some(f) = first {
            out.push_str(f);
        }
        if let Some(l) = last {
            if !out.is_empty() {
                out.push(' ');
            }
            out.push_str(l);
        }
        return Some(out);
    }

    let full = member_full.map(str::trim).filter(|s| !s.is_empty())?;
    let base = full.split(" (").next().unwrap_or(full).trim();
    if base.is_empty() {
        None
    } else {
        Some(base.to_string())
    }
}

fn parse_party(party: &str) -> Party {
    match party.trim() {
        "D" => Party::Democrat,
        "R" => Party::Republican,
        "I" => Party::Independent,
        _ => Party::Other,
    }
}

// ============================================================================
// Floor Activity XML Structures
// ============================================================================

/// Root element of the floor activity XML
/// The Senate floor activity XML may have different root element names,
/// so we support multiple variations.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct FloorSummary {
    #[serde(default)]
    congress: Option<u32>,
    #[serde(default)]
    session: Option<u32>,
    #[serde(default)]
    date: Option<String>,
    #[serde(default, rename = "legislative_day")]
    legislative_day: Option<String>,
    #[serde(default, rename = "floor_actions")]
    floor_actions: Option<FloorActions>,
    #[serde(default, rename = "action")]
    actions: Option<Vec<FloorAction>>,
    #[serde(default, rename = "floor_action")]
    floor_action_list: Option<Vec<FloorAction>>,
    /// Some XML formats have a summary directly
    #[serde(default)]
    summary: Option<String>,
    /// Some XML formats have a title
    #[serde(default)]
    title: Option<String>,
}

/// Container for floor actions
#[derive(Debug, Deserialize)]
struct FloorActions {
    #[serde(rename = "$value", default)]
    actions: Vec<FloorAction>,
}

/// Individual floor action
#[derive(Debug, Deserialize)]
struct FloorAction {
    #[serde(default)]
    time: Option<String>,
    #[serde(default, rename = "action_time")]
    action_time: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default, rename = "action_text")]
    action_text: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default, rename = "action_description")]
    action_description: Option<String>,
    #[serde(default)]
    item: Option<String>,
    #[serde(default, rename = "action_item")]
    action_item: Option<String>,
    #[serde(default)]
    result: Option<String>,
    #[serde(default, rename = "action_result")]
    action_result: Option<String>,
    /// Raw text content for simple XML structures
    #[serde(rename = "$value", default)]
    content: Option<String>,
}

// ============================================================================
// Floor Activity Public API
// ============================================================================

/// Fetch the floor activity XML for a given date
///
/// Returns the raw XML string, or an error if the fetch fails.
/// Note: Floor activity data may not be available for all dates (weekends, recesses, etc.)
pub async fn fetch_floor_activity(config: &Config, date: NaiveDate) -> Result<String> {
    let date_str = format_senate_xml_date(date);
    let url = config.senate_floor_activity_url(&date_str);

    let client = reqwest::Client::builder()
        .timeout(DEFAULT_TIMEOUT)
        .user_agent("daily_senate_update/0.1")
        .build()
        .context("Failed to build HTTP client")?;

    let response = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "text/xml, application/xml;q=0.9, */*;q=0.1")
        .send()
        .await
        .with_context(|| format!("Failed to fetch floor activity from {}", url))?;

    if !response.status().is_success() {
        anyhow::bail!(
            "Failed to fetch floor activity: HTTP {} from {}",
            response.status(),
            url
        );
    }

    response
        .text()
        .await
        .with_context(|| "Failed to read floor activity response body")
}

/// Parse floor activity XML into a FloorSummary
fn parse_floor_activity(xml: &str) -> Result<FloorSummary> {
    // Try parsing with different root element names
    // The Senate XML can have different structures depending on the source

    // First, try direct parsing
    if let Ok(summary) = from_str::<FloorSummary>(xml) {
        return Ok(summary);
    }

    // If that fails, try to extract content more flexibly
    // by wrapping in a container
    Err(anyhow::anyhow!(
        "Failed to parse floor activity XML - unexpected structure"
    ))
}

/// Convert a FloorSummary into a list of Events
fn floor_summary_to_events(summary: &FloorSummary, config: &Config, date: NaiveDate) -> Vec<SenateEvent> {
    let mut events = Vec::new();

    // Get the congress and session from the summary or use config defaults
    let congress = summary.congress.unwrap_or(config.congress);
    let session = summary.session.unwrap_or(config.session);

    // Collect all actions from various possible sources in the XML
    let mut all_actions: Vec<&FloorAction> = Vec::new();

    if let Some(floor_actions) = &summary.floor_actions {
        all_actions.extend(floor_actions.actions.iter());
    }
    if let Some(actions) = &summary.actions {
        all_actions.extend(actions.iter());
    }
    if let Some(floor_action_list) = &summary.floor_action_list {
        all_actions.extend(floor_action_list.iter());
    }

    // If we have individual actions, create events for each
    for (idx, action) in all_actions.iter().enumerate() {
        if let Some(event) = floor_action_to_event(action, idx, congress, session, date, config) {
            events.push(event);
        }
    }

    // If no actions but we have a summary, create a single summary event
    if events.is_empty() {
        if let Some(summary_text) = &summary.summary {
            if !summary_text.trim().is_empty() {
                let event = create_floor_summary_event(
                    summary_text,
                    summary.title.as_deref(),
                    congress,
                    session,
                    date,
                    config,
                );
                events.push(event);
            }
        } else if let Some(title) = &summary.title {
            // If we only have a title, create an event with just the title
            if !title.trim().is_empty() {
                let event =
                    create_floor_summary_event(title, None, congress, session, date, config);
                events.push(event);
            }
        }
    }

    events
}

/// Convert a single FloorAction into an Event
fn floor_action_to_event(
    action: &FloorAction,
    index: usize,
    congress: u32,
    session: u32,
    date: NaiveDate,
    config: &Config,
) -> Option<SenateEvent> {
    // Get the text/description from various possible fields
    let text = action
        .text
        .as_ref()
        .or(action.action_text.as_ref())
        .or(action.description.as_ref())
        .or(action.action_description.as_ref())
        .or(action.content.as_ref())
        .cloned()
        .unwrap_or_default();

    // Skip empty actions
    if text.trim().is_empty() {
        return None;
    }

    // Get the time from various possible fields
    let time_str = action
        .time
        .as_ref()
        .or(action.action_time.as_ref())
        .cloned();

    // Parse the timestamp
    let timestamp = parse_floor_action_time(date, time_str.as_deref());

    // Generate a unique ID for this action
    let id = format!(
        "floor-{}-{}-{}-{}",
        congress,
        session,
        date.format("%Y%m%d"),
        index
    );

    // Build the title (truncate if too long)
    let title = build_floor_action_title(&text);

    // Create the event
    let mut event =
        SenateEvent::new_floor_activity(id, title, timestamp, congress, session);

    // Add the full text as description if it's longer than the title
    if text.len() > 80 {
        event = event.with_description(text);
    }

    // Add URL if we have config
    let date_str = format_senate_xml_date(date);
    event = event.with_url(config.senate_floor_activity_url(&date_str));

    // Add any additional context from the action
    if let Some(item) = action.item.as_ref().or(action.action_item.as_ref()) {
        if !item.trim().is_empty() {
            let desc = event.description.clone().unwrap_or_default();
            let new_desc = if desc.is_empty() {
                format!("Item: {}", item)
            } else {
                format!("{} | Item: {}", desc, item)
            };
            event = event.with_description(new_desc);
        }
    }

    if let Some(result) = action.result.as_ref().or(action.action_result.as_ref()) {
        if !result.trim().is_empty() {
            let desc = event.description.clone().unwrap_or_default();
            let new_desc = if desc.is_empty() {
                format!("Result: {}", result)
            } else {
                format!("{} | Result: {}", desc, result)
            };
            event = event.with_description(new_desc);
        }
    }

    Some(event)
}

/// Create a summary event when we don't have individual actions
fn create_floor_summary_event(
    summary_text: &str,
    title: Option<&str>,
    congress: u32,
    session: u32,
    date: NaiveDate,
    config: &Config,
) -> SenateEvent {
    let id = format!("floor-{}-{}-{}-summary", congress, session, date.format("%Y%m%d"));

    // Use the title if provided, otherwise truncate the summary
    let event_title = title
        .map(|t| t.to_string())
        .unwrap_or_else(|| build_floor_action_title(summary_text));

    // Default to noon Eastern time for summaries
    let timestamp = parse_floor_action_time(date, None);

    let mut event = SenateEvent::new_floor_activity(id, event_title, timestamp, congress, session);

    // Add full summary as description
    if summary_text.len() > 80 || title.is_some() {
        event = event.with_description(summary_text.to_string());
    }

    // Add URL
    let date_str = format_senate_xml_date(date);
    event = event.with_url(config.senate_floor_activity_url(&date_str));

    event
}

/// Build a title from floor action text, truncating if necessary
fn build_floor_action_title(text: &str) -> String {
    let text = text.trim();

    // Clean up whitespace
    let text: String = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if text.len() <= 80 {
        text
    } else {
        // Truncate at word boundary
        let truncated: String = text.chars().take(77).collect();
        if let Some(last_space) = truncated.rfind(' ') {
            format!("{}...", &truncated[..last_space])
        } else {
            format!("{}...", truncated)
        }
    }
}

/// Parse a floor action time into a UTC timestamp
fn parse_floor_action_time(date: NaiveDate, time_str: Option<&str>) -> chrono::DateTime<Utc> {
    if let Some(time_str) = time_str {
        let time_str = time_str.trim();

        // Try various time formats
        let time_formats = [
            "%I:%M %p",    // 10:30 AM
            "%I:%M%p",     // 10:30AM
            "%H:%M:%S",    // 14:30:00
            "%H:%M",       // 14:30
        ];

        for fmt in time_formats {
            if let Ok(time) = chrono::NaiveTime::parse_from_str(time_str, fmt) {
                let datetime = date.and_time(time);
                if let Some(eastern_dt) = New_York.from_local_datetime(&datetime).single() {
                    return eastern_dt.with_timezone(&Utc);
                }
            }
        }
    }

    // Default to noon Eastern time
    let default_time = chrono::NaiveTime::from_hms_opt(12, 0, 0).unwrap();
    let datetime = date.and_time(default_time);
    New_York
        .from_local_datetime(&datetime)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now)
}

/// Fetch and parse floor activity for a given date, returning Events
///
/// This is the main public function for getting floor activity data.
/// It handles errors gracefully - if the floor activity data is not available
/// for the given date (e.g., weekends, recesses), it returns an empty vector
/// rather than failing.
pub async fn fetch_floor_activity_events(config: &Config, date: NaiveDate) -> Result<Vec<SenateEvent>> {
    match fetch_floor_activity(config, date).await {
        Ok(xml) => match parse_floor_activity(&xml) {
            Ok(summary) => Ok(floor_summary_to_events(&summary, config, date)),
            Err(e) => {
                // Log parse error but return empty list
                eprintln!(
                    "Warning: Failed to parse floor activity for {}: {}",
                    date, e
                );
                Ok(Vec::new())
            }
        },
        Err(e) => {
            // HTTP 404 is expected for weekends/recesses - don't log as warning
            let error_msg = e.to_string();
            if error_msg.contains("404") || error_msg.contains("Not Found") {
                // This is expected, return empty list silently
                Ok(Vec::new())
            } else {
                // Log other errors as warnings
                eprintln!(
                    "Warning: Failed to fetch floor activity for {}: {}",
                    date, e
                );
                Ok(Vec::new())
            }
        }
    }
}

/// Try to fetch floor activity, returning None if not available
///
/// This is useful when you want to handle the absence of data explicitly
/// rather than getting an empty list.
pub async fn try_fetch_floor_activity_events(
    config: &Config,
    date: NaiveDate,
) -> Option<Vec<SenateEvent>> {
    match fetch_floor_activity(config, date).await {
        Ok(xml) => match parse_floor_activity(&xml) {
            Ok(summary) => {
                let events = floor_summary_to_events(&summary, config, date);
                if events.is_empty() {
                    None
                } else {
                    Some(events)
                }
            }
            Err(_) => None,
        },
        Err(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_member_xml_and_filter_state() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <contact_information>
            <member>
                <member_full>Alsobrooks (D-MD)</member_full>
                <last_name>Alsobrooks</last_name>
                <first_name>Angela D.</first_name>
                <party>D</party>
                <state>MD</state>
                <bioguide_id>A000382</bioguide_id>
            </member>
            <member>
                <member_full>Example (R-MD)</member_full>
                <last_name>Example</last_name>
                <first_name>Sam</first_name>
                <party>R</party>
                <state>MD</state>
                <bioguide_id>E000000</bioguide_id>
            </member>
        </contact_information>"#;

        let senators = parse_senators_from_member_data_xml(xml).unwrap();
        assert_eq!(senators.len(), 2);

        let md = senators_for_state(&senators, "md").unwrap();
        assert_eq!(md[0].state, "MD");
        assert_eq!(md[1].state, "MD");
        assert_eq!(md[0].party, Party::Democrat);
        assert_eq!(md[1].party, Party::Republican);
    }

    #[test]
    fn test_build_floor_action_title() {
        // Short text should be returned as-is
        assert_eq!(
            build_floor_action_title("The Senate convened"),
            "The Senate convened"
        );

        // Long text should be truncated at word boundary
        let long_text = "The Senate convened at 10:00 AM and began consideration of S. 1234, a bill to provide for the improvement of education in America";
        let title = build_floor_action_title(long_text);
        assert!(title.len() <= 80);
        assert!(title.ends_with("..."));

        // Whitespace should be normalized
        assert_eq!(
            build_floor_action_title("  Multiple   spaces   here  "),
            "Multiple spaces here"
        );
    }

    #[test]
    fn test_parse_floor_action_time() {
        let date = NaiveDate::from_ymd_opt(2024, 6, 15).unwrap();

        // With time string
        let ts = parse_floor_action_time(date, Some("10:30 AM"));
        // Should be 10:30 AM Eastern = 14:30 UTC (or 15:30 during DST)
        assert_eq!(ts.date_naive(), date);

        // Without time string - defaults to noon
        let ts = parse_floor_action_time(date, None);
        assert_eq!(ts.date_naive(), date);

        // 24-hour format
        let ts = parse_floor_action_time(date, Some("14:30"));
        assert_eq!(ts.date_naive(), date);
    }

    #[test]
    fn test_parse_floor_activity_xml_with_summary() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <floor_summary>
            <congress>118</congress>
            <session>2</session>
            <date>2024-06-15</date>
            <summary>The Senate convened and considered various measures.</summary>
        </floor_summary>"#;

        let summary = parse_floor_activity(xml).unwrap();
        assert_eq!(summary.congress, Some(118));
        assert_eq!(summary.session, Some(2));
        assert!(summary.summary.is_some());
    }

    #[test]
    fn test_floor_summary_to_events_with_summary() {
        let summary = FloorSummary {
            congress: Some(118),
            session: Some(2),
            date: Some("2024-06-15".to_string()),
            legislative_day: None,
            floor_actions: None,
            actions: None,
            floor_action_list: None,
            summary: Some("The Senate convened and considered various measures.".to_string()),
            title: None,
        };

        let config = Config {
            congress_api_key: None,
            congress: 118,
            session: 2,
            senate_xml_base_url: "https://www.senate.gov/legislative/LIS/".to_string(),
            congress_api_base_url: "https://api.congress.gov/".to_string(),
        };

        let date = NaiveDate::from_ymd_opt(2024, 6, 15).unwrap();
        let events = floor_summary_to_events(&summary, &config, date);

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, EventType::FloorActivity);
        assert!(events[0].title.contains("Senate convened"));
    }

    #[test]
    fn test_floor_action_to_event() {
        let action = FloorAction {
            time: Some("10:30 AM".to_string()),
            action_time: None,
            text: Some("The Senate convened at 10:30 AM".to_string()),
            action_text: None,
            description: None,
            action_description: None,
            item: None,
            action_item: None,
            result: None,
            action_result: None,
            content: None,
        };

        let config = Config {
            congress_api_key: None,
            congress: 118,
            session: 2,
            senate_xml_base_url: "https://www.senate.gov/legislative/LIS/".to_string(),
            congress_api_base_url: "https://api.congress.gov/".to_string(),
        };

        let date = NaiveDate::from_ymd_opt(2024, 6, 15).unwrap();
        let event = floor_action_to_event(&action, 0, 118, 2, date, &config);

        assert!(event.is_some());
        let event = event.unwrap();
        assert_eq!(event.event_type, EventType::FloorActivity);
        assert!(event.title.contains("Senate convened"));
    }
}

