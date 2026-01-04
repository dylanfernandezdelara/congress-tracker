//! Senate XML data source.
//!
//! Phase 2A: Fetch/parse Senate member data into [`Senator`].
//! Phase 2B: Fetch/parse Senate vote list and individual vote details.
//!
//! The plan references `cvc_member_data.xml` (via [`Config::senate_member_data_url()`]). In some
//! environments that endpoint may redirect to HTML. When that happens, we fall back to the Senate's
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
use crate::models::event::{Event as SenateEvent, SenatorVote, VotePosition, VoteResult};
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

// ============================================================================
// Vote List XML Structures (Phase 2B)
// ============================================================================

/// Summary info for a vote in the vote menu list
#[derive(Debug, Clone)]
pub struct VoteSummary {
    /// Vote number within the session
    pub vote_number: u32,
    /// Date of the vote (YYYY-MM-DD or similar)
    pub date: NaiveDate,
    /// Brief title/question of the vote
    pub title: String,
    /// Result (e.g., "Agreed to", "Rejected")
    pub result: Option<String>,
}

#[derive(Debug, Default)]
struct VoteMenuFields {
    vote_number: Option<u32>,
    vote_date: Option<String>,
    issue: Option<String>,
    question: Option<String>,
    result: Option<String>,
    title: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VoteMenuField {
    VoteNumber,
    VoteDate,
    Issue,
    Question,
    Result,
    Title,
}

// ============================================================================
// Individual Vote XML Structures (Phase 2B)
// ============================================================================

/// Parsed individual senator's vote from the vote XML
#[derive(Debug, Clone)]
pub(crate) struct ParsedMemberVote {
    pub member_full: String,
    pub lis_member_id: Option<String>,
    pub party: String,
    pub state: String,
    pub vote_cast: String,
}

/// Parsed vote details from the individual vote XML
#[derive(Debug)]
pub(crate) struct ParsedVoteDetails {
    pub congress: u32,
    pub session: u32,
    pub vote_number: u32,
    pub vote_date: NaiveDate,
    pub vote_title: String,
    pub vote_question: String,
    pub vote_result_text: String,
    pub yeas: u32,
    pub nays: u32,
    pub present: u32,
    pub not_voting: u32,
    pub member_votes: Vec<ParsedMemberVote>,
}

// ============================================================================
// Vote List Public API (Phase 2B)
// ============================================================================

/// Fetch the vote menu/list XML for the configured congress and session
pub async fn fetch_vote_list_xml(config: &Config) -> Result<String> {
    let url = config.senate_vote_list_url();

    let client = reqwest::Client::builder()
        .timeout(DEFAULT_TIMEOUT)
        .user_agent("daily_senate_update/0.1")
        .build()
        .context("Failed to build HTTP client")?;

    let response = client
        .get(&url)
        .header(
            reqwest::header::ACCEPT,
            "text/xml, application/xml;q=0.9, */*;q=0.1",
        )
        .send()
        .await
        .with_context(|| format!("Failed to fetch vote list from {}", url))?;

    if !response.status().is_success() {
        anyhow::bail!(
            "Failed to fetch vote list: HTTP {} from {}",
            response.status(),
            url
        );
    }

    response
        .text()
        .await
        .with_context(|| "Failed to read vote list response body")
}

/// Parse the vote menu XML into a list of VoteSummary
///
/// The vote_menu XML has structure like:
/// ```xml
/// <vote_summary>
///   <congress>118</congress>
///   <session>2</session>
///   <votes>
///     <vote>
///       <vote_number>123</vote_number>
///       <vote_date>January 15, 2024</vote_date>
///       <issue>S. 1234</issue>
///       <question>On the Motion</question>
///       <result>Agreed to</result>
///       <vote_title>To amend...</vote_title>
///     </vote>
///     ...
///   </votes>
/// </vote_summary>
/// ```
pub fn parse_vote_list_xml(xml: &str) -> Result<Vec<VoteSummary>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut current_vote: Option<VoteMenuFields> = None;
    let mut current_field: Option<VoteMenuField> = None;
    let mut in_votes_section = false;
    let mut reading_congress_year = false;
    let mut congress_year: Option<u32> = None;

    let mut out: Vec<VoteSummary> = Vec::new();

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .context("Failed reading vote menu XML")?;

        match event {
            Event::Start(e) => match e.name().as_ref() {
                b"votes" => {
                    in_votes_section = true;
                }
                b"vote" if in_votes_section => {
                    current_vote = Some(VoteMenuFields::default());
                    current_field = None;
                }
                b"congress_year" => {
                    reading_congress_year = true;
                    current_field = None;
                }
                b"vote_number" => current_field = Some(VoteMenuField::VoteNumber),
                b"vote_date" => current_field = Some(VoteMenuField::VoteDate),
                b"issue" => current_field = Some(VoteMenuField::Issue),
                b"question" => current_field = Some(VoteMenuField::Question),
                b"result" => current_field = Some(VoteMenuField::Result),
                b"vote_title" | b"title" => current_field = Some(VoteMenuField::Title),
                _ => current_field = None,
            },
            Event::Text(e) => {
                let text = e.unescape().context("Failed to unescape vote menu XML text")?;
                let text = text.trim();
                if !text.is_empty() {
                    // Handle congress_year
                    if reading_congress_year {
                        if let Ok(year) = text.parse::<u32>() {
                            congress_year = Some(year);
                        }
                        reading_congress_year = false;
                        continue;
                    }
                    
                    if let (Some(vote), Some(field)) = (current_vote.as_mut(), current_field) {
                        match field {
                            VoteMenuField::VoteNumber => {
                                vote.vote_number = text.parse().ok();
                            }
                            VoteMenuField::VoteDate => {
                                vote.vote_date = Some(text.to_string());
                            }
                            VoteMenuField::Issue => {
                                vote.issue = Some(text.to_string());
                            }
                            VoteMenuField::Question => {
                                vote.question = Some(text.to_string());
                            }
                            VoteMenuField::Result => {
                                vote.result = Some(text.to_string());
                            }
                            VoteMenuField::Title => {
                                vote.title = Some(text.to_string());
                            }
                        }
                    }
                }
            }
            Event::End(e) => {
                if e.name().as_ref() == b"congress_year" {
                    reading_congress_year = false;
                }
                current_field = None;

                match e.name().as_ref() {
                    b"votes" => {
                        in_votes_section = false;
                    }
                    b"vote" if in_votes_section => {
                        if let Some(vote) = current_vote.take() {
                            if let Some(summary) = vote_menu_fields_to_summary(vote, congress_year) {
                                out.push(summary);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }

        buf.clear();
    }

    Ok(out)
}

/// Filter the vote list to return only votes on a specific date
pub fn filter_votes_by_date(votes: &[VoteSummary], date: NaiveDate) -> Vec<VoteSummary> {
    votes
        .iter()
        .filter(|v| v.date == date)
        .cloned()
        .collect()
}

/// Fetch all votes for a specific date, returning VoteSummary list
pub async fn fetch_votes_for_date(config: &Config, date: NaiveDate) -> Result<Vec<VoteSummary>> {
    let xml = fetch_vote_list_xml(config).await?;
    let all_votes = parse_vote_list_xml(&xml)?;
    Ok(filter_votes_by_date(&all_votes, date))
}

// ============================================================================
// Individual Vote Public API (Phase 2B)
// ============================================================================

/// Fetch the XML for a specific vote by vote number
pub async fn fetch_vote_xml(config: &Config, vote_number: u32) -> Result<String> {
    let url = config.senate_vote_url(vote_number);

    let client = reqwest::Client::builder()
        .timeout(DEFAULT_TIMEOUT)
        .user_agent("daily_senate_update/0.1")
        .build()
        .context("Failed to build HTTP client")?;

    let response = client
        .get(&url)
        .header(
            reqwest::header::ACCEPT,
            "text/xml, application/xml;q=0.9, */*;q=0.1",
        )
        .send()
        .await
        .with_context(|| format!("Failed to fetch vote {} from {}", vote_number, url))?;

    if !response.status().is_success() {
        anyhow::bail!(
            "Failed to fetch vote {}: HTTP {} from {}",
            vote_number,
            response.status(),
            url
        );
    }

    response
        .text()
        .await
        .with_context(|| format!("Failed to read vote {} response body", vote_number))
}

/// Parse an individual vote XML into vote details
///
/// The individual vote XML has structure like:
/// ```xml
/// <roll_call_vote>
///   <congress>118</congress>
///   <session>2</session>
///   <vote_number>123</vote_number>
///   <vote_date>January 15, 2024, 02:30 PM</vote_date>
///   <vote_question_text>On the Motion</vote_question_text>
///   <vote_document_text>S. 1234</vote_document_text>
///   <vote_result_text>Agreed to</vote_result_text>
///   <count>
///     <yeas>60</yeas>
///     <nays>40</nays>
///     <present>0</present>
///     <absent>0</absent>
///   </count>
///   <members>
///     <member>
///       <member_full>Senator Name (R-TX)</member_full>
///       <lis_member_id>S123</lis_member_id>
///       <party>R</party>
///       <state>TX</state>
///       <vote_cast>Yea</vote_cast>
///     </member>
///     ...
///   </members>
/// </roll_call_vote>
/// ```
pub fn parse_vote_xml(xml: &str, config: &Config) -> Result<ParsedVoteDetails> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();

    // Top-level vote fields
    let mut congress: Option<u32> = None;
    let mut session: Option<u32> = None;
    let mut vote_number: Option<u32> = None;
    let mut vote_date_str: Option<String> = None;
    let mut vote_question: Option<String> = None;
    let mut vote_document: Option<String> = None;
    let mut vote_result_text: Option<String> = None;
    let mut vote_title: Option<String> = None;

    // Count fields
    let mut yeas: Option<u32> = None;
    let mut nays: Option<u32> = None;
    let mut present: Option<u32> = None;
    let mut not_voting: Option<u32> = None;

    // Member parsing
    let mut in_members = false;
    let mut in_count = false;
    let mut current_member: Option<ParsedMemberVoteBuilder> = None;
    let mut member_votes: Vec<ParsedMemberVote> = Vec::new();

    #[derive(Debug, Clone, Copy)]
    enum CurrentField {
        Congress,
        Session,
        VoteNumber,
        VoteDate,
        VoteQuestion,
        VoteDocument,
        VoteResult,
        VoteTitle,
        Yeas,
        Nays,
        Present,
        Absent,
        NotVoting,
        MemberFull,
        LisMemberId,
        Party,
        State,
        VoteCast,
    }

    let mut current_field: Option<CurrentField> = None;

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .context("Failed reading vote XML")?;

        match event {
            Event::Start(e) => {
                let name = e.name();
                match name.as_ref() {
                    b"members" => {
                        in_members = true;
                    }
                    b"count" | b"counts" => {
                        in_count = true;
                    }
                    b"member" if in_members => {
                        current_member = Some(ParsedMemberVoteBuilder::default());
                    }
                    b"congress" => current_field = Some(CurrentField::Congress),
                    b"session" => current_field = Some(CurrentField::Session),
                    b"vote_number" => current_field = Some(CurrentField::VoteNumber),
                    b"vote_date" => current_field = Some(CurrentField::VoteDate),
                    b"vote_question_text" | b"question" | b"vote_question" => {
                        current_field = Some(CurrentField::VoteQuestion)
                    }
                    b"vote_document_text" | b"document_short_title" | b"issue" => {
                        current_field = Some(CurrentField::VoteDocument)
                    }
                    b"vote_result_text" | b"vote_result" | b"result" => {
                        current_field = Some(CurrentField::VoteResult)
                    }
                    b"vote_title" | b"title" => current_field = Some(CurrentField::VoteTitle),
                    b"yeas" if in_count => current_field = Some(CurrentField::Yeas),
                    b"nays" if in_count => current_field = Some(CurrentField::Nays),
                    b"present" if in_count => current_field = Some(CurrentField::Present),
                    b"absent" if in_count => current_field = Some(CurrentField::Absent),
                    b"not_voting" if in_count => current_field = Some(CurrentField::NotVoting),
                    b"member_full" if in_members => {
                        current_field = Some(CurrentField::MemberFull)
                    }
                    b"lis_member_id" if in_members => {
                        current_field = Some(CurrentField::LisMemberId)
                    }
                    b"party" if in_members => current_field = Some(CurrentField::Party),
                    b"state" if in_members => current_field = Some(CurrentField::State),
                    b"vote_cast" if in_members => current_field = Some(CurrentField::VoteCast),
                    _ => current_field = None,
                }
            }
            Event::Text(e) => {
                if let Some(field) = current_field {
                    let text = e.unescape().context("Failed to unescape vote XML text")?;
                    let text = text.trim();
                    if !text.is_empty() {
                        match field {
                            CurrentField::Congress => congress = text.parse().ok(),
                            CurrentField::Session => session = text.parse().ok(),
                            CurrentField::VoteNumber => vote_number = text.parse().ok(),
                            CurrentField::VoteDate => vote_date_str = Some(text.to_string()),
                            CurrentField::VoteQuestion => vote_question = Some(text.to_string()),
                            CurrentField::VoteDocument => vote_document = Some(text.to_string()),
                            CurrentField::VoteResult => vote_result_text = Some(text.to_string()),
                            CurrentField::VoteTitle => vote_title = Some(text.to_string()),
                            CurrentField::Yeas => yeas = text.parse().ok(),
                            CurrentField::Nays => nays = text.parse().ok(),
                            CurrentField::Present => present = text.parse().ok(),
                            CurrentField::Absent | CurrentField::NotVoting => {
                                not_voting = text.parse().ok()
                            }
                            CurrentField::MemberFull => {
                                if let Some(m) = current_member.as_mut() {
                                    m.member_full = Some(text.to_string());
                                }
                            }
                            CurrentField::LisMemberId => {
                                if let Some(m) = current_member.as_mut() {
                                    m.lis_member_id = Some(text.to_string());
                                }
                            }
                            CurrentField::Party => {
                                if let Some(m) = current_member.as_mut() {
                                    m.party = Some(text.to_string());
                                }
                            }
                            CurrentField::State => {
                                if let Some(m) = current_member.as_mut() {
                                    m.state = Some(text.to_string());
                                }
                            }
                            CurrentField::VoteCast => {
                                if let Some(m) = current_member.as_mut() {
                                    m.vote_cast = Some(text.to_string());
                                }
                            }
                        }
                    }
                }
            }
            Event::End(e) => {
                current_field = None;

                match e.name().as_ref() {
                    b"members" => {
                        in_members = false;
                    }
                    b"count" | b"counts" => {
                        in_count = false;
                    }
                    b"member" if in_members => {
                        if let Some(builder) = current_member.take() {
                            if let Some(vote) = builder.build() {
                                member_votes.push(vote);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }

        buf.clear();
    }

    // Build the vote title from available components
    let final_title = build_vote_title(
        vote_title.as_deref(),
        vote_question.as_deref(),
        vote_document.as_deref(),
    );

    // Parse the vote date
    let vote_date = parse_vote_date(vote_date_str.as_deref(), None)
        .unwrap_or_else(|| crate::util::time::today_eastern());

    Ok(ParsedVoteDetails {
        congress: congress.unwrap_or(config.congress),
        session: session.unwrap_or(config.session),
        vote_number: vote_number.context("Missing vote_number in vote XML")?,
        vote_date,
        vote_title: final_title,
        vote_question: vote_question.unwrap_or_default(),
        vote_result_text: vote_result_text.unwrap_or_default(),
        yeas: yeas.unwrap_or(0),
        nays: nays.unwrap_or(0),
        present: present.unwrap_or(0),
        not_voting: not_voting.unwrap_or(0),
        member_votes,
    })
}

/// Convert parsed vote details to a SenateEvent
pub fn vote_details_to_event(details: &ParsedVoteDetails, config: &Config) -> SenateEvent {
    let id = format!(
        "vote-{}-{}-{}",
        details.congress, details.session, details.vote_number
    );

    // Parse timestamp (default to noon Eastern on vote date)
    let timestamp = parse_floor_action_time(details.vote_date, None);

    let mut event = SenateEvent::new_vote(
        id,
        details.vote_title.clone(),
        timestamp,
        details.congress,
        details.session,
    );

    // Add vote result
    let passed = is_vote_passed(&details.vote_result_text);
    event = event.with_vote_result(VoteResult {
        yeas: details.yeas,
        nays: details.nays,
        present: details.present,
        not_voting: details.not_voting,
        passed,
    });

    // Add description with question and result
    let description = format!(
        "{} - {}",
        details.vote_question, details.vote_result_text
    );
    event = event.with_description(description);

    // Add senator votes
    let senator_votes: Vec<SenatorVote> = details
        .member_votes
        .iter()
        .map(|mv| SenatorVote {
            bioguide_id: mv.lis_member_id.clone().unwrap_or_default(),
            name: clean_member_name(&mv.member_full),
            state: mv.state.clone(),
            party: mv.party.clone(),
            position: parse_vote_position(&mv.vote_cast),
        })
        .collect();

    event = event.with_senator_votes(senator_votes);

    // Add URL
    event = event.with_url(config.senate_vote_url(details.vote_number));

    event
}

/// Fetch and parse a single vote, returning it as a SenateEvent
pub async fn fetch_vote_event(config: &Config, vote_number: u32) -> Result<SenateEvent> {
    let xml = fetch_vote_xml(config, vote_number).await?;
    let details = parse_vote_xml(&xml, config)?;
    Ok(vote_details_to_event(&details, config))
}

/// Fetch all vote events for a specific date
///
/// This fetches the vote list, filters by date, then fetches full details for each vote.
pub async fn fetch_vote_events_for_date(
    config: &Config,
    date: NaiveDate,
) -> Result<Vec<SenateEvent>> {
    let vote_summaries = fetch_votes_for_date(config, date).await?;

    let mut events = Vec::new();
    for summary in vote_summaries {
        match fetch_vote_event(config, summary.vote_number).await {
            Ok(event) => events.push(event),
            Err(e) => {
                eprintln!(
                    "Warning: Failed to fetch vote {}: {}",
                    summary.vote_number, e
                );
            }
        }
    }

    Ok(events)
}

/// Get votes filtered by state (showing how that state's senators voted)
///
/// Returns vote events with senator_votes filtered to only include senators from the given state.
pub fn filter_votes_by_state(events: &[SenateEvent], state: &str) -> Vec<SenateEvent> {
    let st = state.trim().to_uppercase();

    events
        .iter()
        .map(|e| {
            let mut event = e.clone();
            if let Some(ref votes) = e.senator_votes {
                let filtered: Vec<SenatorVote> = votes
                    .iter()
                    .filter(|v| v.state.eq_ignore_ascii_case(&st))
                    .cloned()
                    .collect();
                event.senator_votes = Some(filtered);
            }
            event
        })
        .collect()
}

// ============================================================================
// Vote Helper Functions (Phase 2B)
// ============================================================================

#[derive(Debug, Default)]
struct ParsedMemberVoteBuilder {
    member_full: Option<String>,
    lis_member_id: Option<String>,
    party: Option<String>,
    state: Option<String>,
    vote_cast: Option<String>,
}

impl ParsedMemberVoteBuilder {
    fn build(self) -> Option<ParsedMemberVote> {
        let member_full = self.member_full?;
        let party = self.party.unwrap_or_default();
        let state = self.state.unwrap_or_default();
        let vote_cast = self.vote_cast.unwrap_or_default();

        Some(ParsedMemberVote {
            member_full,
            lis_member_id: self.lis_member_id,
            party,
            state,
            vote_cast,
        })
    }
}

/// Convert vote menu fields to a VoteSummary
fn vote_menu_fields_to_summary(fields: VoteMenuFields, congress_year: Option<u32>) -> Option<VoteSummary> {
    let vote_number = fields.vote_number?;
    let date_str = fields.vote_date?;
    let date = parse_vote_date(Some(&date_str), congress_year)?;

    // Build title from available fields
    let title = build_vote_menu_title(
        fields.title.as_deref(),
        fields.question.as_deref(),
        fields.issue.as_deref(),
    );

    Some(VoteSummary {
        vote_number,
        date,
        title,
        result: fields.result,
    })
}

/// Build a title for the vote menu entry
fn build_vote_menu_title(title: Option<&str>, question: Option<&str>, issue: Option<&str>) -> String {
    // Prefer title, then combine question + issue
    if let Some(t) = title.filter(|s| !s.trim().is_empty()) {
        return truncate_title(t, 100);
    }

    let mut parts = Vec::new();
    if let Some(q) = question.filter(|s| !s.trim().is_empty()) {
        parts.push(q.trim());
    }
    if let Some(i) = issue.filter(|s| !s.trim().is_empty()) {
        parts.push(i.trim());
    }

    if parts.is_empty() {
        "Unknown Vote".to_string()
    } else {
        truncate_title(&parts.join(" - "), 100)
    }
}

/// Build the full vote title from available fields
fn build_vote_title(title: Option<&str>, question: Option<&str>, document: Option<&str>) -> String {
    // Prefer explicit title
    if let Some(t) = title.filter(|s| !s.trim().is_empty()) {
        return truncate_title(t, 120);
    }

    // Otherwise combine question and document
    let mut parts = Vec::new();
    if let Some(q) = question.filter(|s| !s.trim().is_empty()) {
        parts.push(q.trim());
    }
    if let Some(d) = document.filter(|s| !s.trim().is_empty()) {
        parts.push(d.trim());
    }

    if parts.is_empty() {
        "Unknown Vote".to_string()
    } else {
        truncate_title(&parts.join(": "), 120)
    }
}

/// Truncate a title to max length at word boundary
fn truncate_title(text: &str, max_len: usize) -> String {
    let text = text.trim();
    let text: String = text.split_whitespace().collect::<Vec<_>>().join(" ");

    if text.len() <= max_len {
        text
    } else {
        let truncated: String = text.chars().take(max_len - 3).collect();
        if let Some(last_space) = truncated.rfind(' ') {
            format!("{}...", &truncated[..last_space])
        } else {
            format!("{}...", truncated)
        }
    }
}

/// Parse a vote date string into NaiveDate
///
/// Handles various formats like "January 15, 2024" or "2024-01-15" or "18-Dec"
fn parse_vote_date(date_str: Option<&str>, congress_year: Option<u32>) -> Option<NaiveDate> {
    let date_str = date_str?.trim();
    if date_str.is_empty() {
        return None;
    }

    // Try ISO format first
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        return Some(date);
    }

    // Try "January 15, 2024" format
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%B %d, %Y") {
        return Some(date);
    }

    // Try "January 15, 2024, 02:30 PM" format (strip time)
    let date_only = date_str.split(',').take(2).collect::<Vec<_>>().join(",");
    if let Ok(date) = NaiveDate::parse_from_str(&date_only, "%B %d, %Y") {
        return Some(date);
    }

    // Try "Jan 15, 2024" format
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%b %d, %Y") {
        return Some(date);
    }

    // Try MM/DD/YYYY
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%m/%d/%Y") {
        return Some(date);
    }

    // Try "18-Dec" or "Dec 18" format (requires year)
    if let Some(year) = congress_year {
        // Try "18-Dec" format
        if let Ok(date) = NaiveDate::parse_from_str(&format!("{} {}", date_str, year), "%d-%b %Y") {
            return Some(date);
        }
        // Try "Dec 18" format
        if let Ok(date) = NaiveDate::parse_from_str(&format!("{} {}", date_str, year), "%b %d %Y") {
            return Some(date);
        }
        // Try "18-Dec" with dash separator
        if let Ok(date) = NaiveDate::parse_from_str(&format!("{}-{}", date_str, year), "%d-%b-%Y") {
            return Some(date);
        }
    }

    None
}

/// Parse a vote cast string into VotePosition
fn parse_vote_position(vote_cast: &str) -> VotePosition {
    match vote_cast.trim().to_lowercase().as_str() {
        "yea" | "yes" | "aye" => VotePosition::Yea,
        "nay" | "no" => VotePosition::Nay,
        "present" => VotePosition::Present,
        _ => VotePosition::NotVoting,
    }
}

/// Determine if a vote passed based on result text
fn is_vote_passed(result_text: &str) -> bool {
    let lower = result_text.to_lowercase();
    // Check for rejection first (to handle "Not Agreed To" etc.)
    if lower.contains("not agreed")
        || lower.contains("rejected")
        || lower.contains("failed")
        || lower.contains("not passed")
    {
        return false;
    }
    // Then check for positive outcomes
    lower.contains("agreed")
        || lower.contains("passed")
        || lower.contains("confirmed")
        || lower.contains("adopted")
}

/// Clean up member name (remove party/state suffix)
fn clean_member_name(member_full: &str) -> String {
    // Format is typically "Name (R-TX)" - extract just the name
    member_full
        .split('(')
        .next()
        .unwrap_or(member_full)
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::event::EventType;

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

    // ========================================================================
    // Vote List Tests (Phase 2B)
    // ========================================================================

    #[test]
    fn test_parse_vote_list_xml() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <vote_summary>
            <congress>118</congress>
            <session>2</session>
            <votes>
                <vote>
                    <vote_number>123</vote_number>
                    <vote_date>January 15, 2024</vote_date>
                    <issue>S. 1234</issue>
                    <question>On the Motion</question>
                    <result>Agreed to</result>
                    <vote_title>A bill to do something</vote_title>
                </vote>
                <vote>
                    <vote_number>124</vote_number>
                    <vote_date>January 16, 2024</vote_date>
                    <issue>H.R. 5678</issue>
                    <question>On Passage</question>
                    <result>Rejected</result>
                </vote>
            </votes>
        </vote_summary>"#;

        let votes = parse_vote_list_xml(xml).unwrap();
        assert_eq!(votes.len(), 2);

        assert_eq!(votes[0].vote_number, 123);
        assert_eq!(votes[0].date, NaiveDate::from_ymd_opt(2024, 1, 15).unwrap());
        assert!(votes[0].title.contains("bill to do something"));
        assert_eq!(votes[0].result, Some("Agreed to".to_string()));

        assert_eq!(votes[1].vote_number, 124);
        assert_eq!(votes[1].date, NaiveDate::from_ymd_opt(2024, 1, 16).unwrap());
        assert_eq!(votes[1].result, Some("Rejected".to_string()));
    }

    #[test]
    fn test_filter_votes_by_date() {
        let votes = vec![
            VoteSummary {
                vote_number: 1,
                date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
                title: "Vote 1".to_string(),
                result: None,
            },
            VoteSummary {
                vote_number: 2,
                date: NaiveDate::from_ymd_opt(2024, 1, 16).unwrap(),
                title: "Vote 2".to_string(),
                result: None,
            },
            VoteSummary {
                vote_number: 3,
                date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
                title: "Vote 3".to_string(),
                result: None,
            },
        ];

        let filtered = filter_votes_by_date(&votes, NaiveDate::from_ymd_opt(2024, 1, 15).unwrap());
        assert_eq!(filtered.len(), 2);
        assert_eq!(filtered[0].vote_number, 1);
        assert_eq!(filtered[1].vote_number, 3);
    }

    #[test]
    fn test_parse_vote_xml() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <roll_call_vote>
            <congress>118</congress>
            <session>2</session>
            <vote_number>123</vote_number>
            <vote_date>January 15, 2024</vote_date>
            <vote_question_text>On the Motion to Proceed</vote_question_text>
            <vote_document_text>S. 1234</vote_document_text>
            <vote_result_text>Agreed to</vote_result_text>
            <count>
                <yeas>60</yeas>
                <nays>38</nays>
                <present>1</present>
                <absent>1</absent>
            </count>
            <members>
                <member>
                    <member_full>Smith (R-TX)</member_full>
                    <lis_member_id>S001</lis_member_id>
                    <party>R</party>
                    <state>TX</state>
                    <vote_cast>Yea</vote_cast>
                </member>
                <member>
                    <member_full>Jones (D-CA)</member_full>
                    <lis_member_id>J001</lis_member_id>
                    <party>D</party>
                    <state>CA</state>
                    <vote_cast>Nay</vote_cast>
                </member>
            </members>
        </roll_call_vote>"#;

        let config = Config {
            congress_api_key: None,
            congress: 118,
            session: 2,
            senate_xml_base_url: "https://www.senate.gov/legislative/LIS/".to_string(),
            congress_api_base_url: "https://api.congress.gov/".to_string(),
        };

        let details = parse_vote_xml(xml, &config).unwrap();

        assert_eq!(details.congress, 118);
        assert_eq!(details.session, 2);
        assert_eq!(details.vote_number, 123);
        assert_eq!(details.vote_date, NaiveDate::from_ymd_opt(2024, 1, 15).unwrap());
        assert_eq!(details.yeas, 60);
        assert_eq!(details.nays, 38);
        assert_eq!(details.present, 1);
        assert_eq!(details.not_voting, 1);
        assert_eq!(details.member_votes.len(), 2);

        assert_eq!(details.member_votes[0].state, "TX");
        assert_eq!(details.member_votes[0].vote_cast, "Yea");
        assert_eq!(details.member_votes[1].state, "CA");
        assert_eq!(details.member_votes[1].vote_cast, "Nay");
    }

    #[test]
    fn test_vote_details_to_event() {
        let details = ParsedVoteDetails {
            congress: 118,
            session: 2,
            vote_number: 123,
            vote_date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            vote_title: "On the Motion: S. 1234".to_string(),
            vote_question: "On the Motion to Proceed".to_string(),
            vote_result_text: "Agreed to".to_string(),
            yeas: 60,
            nays: 38,
            present: 1,
            not_voting: 1,
            member_votes: vec![
                ParsedMemberVote {
                    member_full: "Smith (R-TX)".to_string(),
                    lis_member_id: Some("S001".to_string()),
                    party: "R".to_string(),
                    state: "TX".to_string(),
                    vote_cast: "Yea".to_string(),
                },
            ],
        };

        let config = Config {
            congress_api_key: None,
            congress: 118,
            session: 2,
            senate_xml_base_url: "https://www.senate.gov/legislative/LIS/".to_string(),
            congress_api_base_url: "https://api.congress.gov/".to_string(),
        };

        let event = vote_details_to_event(&details, &config);

        assert_eq!(event.event_type, EventType::Vote);
        assert_eq!(event.id, "vote-118-2-123");
        assert!(event.title.contains("Motion"));

        let result = event.vote_result.unwrap();
        assert_eq!(result.yeas, 60);
        assert_eq!(result.nays, 38);
        assert!(result.passed);

        let votes = event.senator_votes.unwrap();
        assert_eq!(votes.len(), 1);
        assert_eq!(votes[0].name, "Smith");
        assert_eq!(votes[0].position, VotePosition::Yea);
    }

    #[test]
    fn test_parse_vote_date() {
        // ISO format
        assert_eq!(
            parse_vote_date(Some("2025-12-18"), None),
            Some(NaiveDate::from_ymd_opt(2025, 12, 18).unwrap())
        );

        // Full month name
        assert_eq!(
            parse_vote_date(Some("December 18, 2025"), None),
            Some(NaiveDate::from_ymd_opt(2025, 12, 18).unwrap())
        );

        // With time
        assert_eq!(
            parse_vote_date(Some("December 18, 2025, 02:30 PM"), None),
            Some(NaiveDate::from_ymd_opt(2025, 12, 18).unwrap())
        );

        // Short month name
        assert_eq!(
            parse_vote_date(Some("Dec 18, 2025"), None),
            Some(NaiveDate::from_ymd_opt(2025, 12, 18).unwrap())
        );

        // MM/DD/YYYY
        assert_eq!(
            parse_vote_date(Some("12/18/2025"), None),
            Some(NaiveDate::from_ymd_opt(2025, 12, 18).unwrap())
        );

        // "18-Dec" format with year
        assert_eq!(
            parse_vote_date(Some("18-Dec"), Some(2025)),
            Some(NaiveDate::from_ymd_opt(2025, 12, 18).unwrap())
        );

        // Empty/invalid
        assert_eq!(parse_vote_date(None, None), None);
        assert_eq!(parse_vote_date(Some(""), None), None);
        assert_eq!(parse_vote_date(Some("invalid"), None), None);
    }

    #[test]
    fn test_parse_vote_position() {
        assert_eq!(parse_vote_position("Yea"), VotePosition::Yea);
        assert_eq!(parse_vote_position("yea"), VotePosition::Yea);
        assert_eq!(parse_vote_position("Yes"), VotePosition::Yea);
        assert_eq!(parse_vote_position("Aye"), VotePosition::Yea);

        assert_eq!(parse_vote_position("Nay"), VotePosition::Nay);
        assert_eq!(parse_vote_position("nay"), VotePosition::Nay);
        assert_eq!(parse_vote_position("No"), VotePosition::Nay);

        assert_eq!(parse_vote_position("Present"), VotePosition::Present);
        assert_eq!(parse_vote_position("present"), VotePosition::Present);

        assert_eq!(parse_vote_position("Not Voting"), VotePosition::NotVoting);
        assert_eq!(parse_vote_position("Absent"), VotePosition::NotVoting);
        assert_eq!(parse_vote_position(""), VotePosition::NotVoting);
    }

    #[test]
    fn test_is_vote_passed() {
        assert!(is_vote_passed("Agreed to"));
        assert!(is_vote_passed("Motion Agreed To"));
        assert!(is_vote_passed("Passed"));
        assert!(is_vote_passed("Confirmed"));
        assert!(is_vote_passed("Amendment Adopted"));

        assert!(!is_vote_passed("Rejected"));
        assert!(!is_vote_passed("Failed"));
        assert!(!is_vote_passed("Not Agreed To"));
    }

    #[test]
    fn test_clean_member_name() {
        assert_eq!(clean_member_name("Smith (R-TX)"), "Smith");
        assert_eq!(clean_member_name("Jones (D-CA)"), "Jones");
        assert_eq!(clean_member_name("Van Hollen (D-MD)"), "Van Hollen");
        assert_eq!(clean_member_name("Simple Name"), "Simple Name");
    }

    #[test]
    fn test_truncate_title() {
        assert_eq!(truncate_title("Short title", 100), "Short title");

        let long_title = "This is a very long title that should be truncated at a word boundary to ensure readability";
        let truncated = truncate_title(long_title, 50);
        assert!(truncated.len() <= 50);
        assert!(truncated.ends_with("..."));

        // Test whitespace normalization
        assert_eq!(truncate_title("  Multiple   spaces  ", 100), "Multiple spaces");
    }

    #[test]
    fn test_filter_votes_by_state() {
        let event = SenateEvent::new_vote(
            "vote-118-2-1".to_string(),
            "Test Vote".to_string(),
            Utc::now(),
            118,
            2,
        )
        .with_senator_votes(vec![
            SenatorVote {
                bioguide_id: "S001".to_string(),
                name: "Smith".to_string(),
                state: "TX".to_string(),
                party: "R".to_string(),
                position: VotePosition::Yea,
            },
            SenatorVote {
                bioguide_id: "J001".to_string(),
                name: "Jones".to_string(),
                state: "CA".to_string(),
                party: "D".to_string(),
                position: VotePosition::Nay,
            },
            SenatorVote {
                bioguide_id: "B001".to_string(),
                name: "Brown".to_string(),
                state: "TX".to_string(),
                party: "R".to_string(),
                position: VotePosition::Yea,
            },
        ]);

        let filtered = filter_votes_by_state(&[event], "TX");
        assert_eq!(filtered.len(), 1);
        let votes = filtered[0].senator_votes.as_ref().unwrap();
        assert_eq!(votes.len(), 2);
        assert!(votes.iter().all(|v| v.state == "TX"));
    }
}

