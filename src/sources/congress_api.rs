//! Congress.gov API client
//!
//! Phase 2D: HTTP client for Congress.gov API with member lookup and activity fetching.
//!
//! This module provides functions to:
//! - Fetch member details by bioguide ID
//! - Fetch recent member activity (sponsored/cosponsored bills)
//!
//! The Congress.gov API requires an API key, which should be set in the
//! `CONGRESS_API_KEY` environment variable.

use std::time::Duration;

use anyhow::{Context, Result};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use chrono_tz::America::New_York;
use serde::Deserialize;

use crate::config::Config;
use crate::models::event::{Event, EventType};
use crate::models::senator::{Party, Senator};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const API_VERSION: &str = "v3";

// ============================================================================
// API Response Structures
// ============================================================================

/// Root response wrapper for member endpoint
#[derive(Debug, Deserialize)]
struct MemberResponse {
    member: MemberData,
}

/// Member data from the Congress.gov API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemberData {
    /// Bioguide ID (unique identifier)
    bioguide_id: String,
    /// Direct link to member on Congress.gov
    #[serde(default)]
    direct_order_name: Option<String>,
    /// First name
    #[serde(default)]
    first_name: Option<String>,
    /// Last name
    #[serde(default)]
    last_name: Option<String>,
    /// Full name (inverted order typically: "Last, First")
    #[serde(default)]
    inverted_order_name: Option<String>,
    /// Party affiliation
    #[serde(default)]
    party_name: Option<String>,
    /// State represented
    #[serde(default)]
    state: Option<String>,
    /// Current member info (for term details)
    #[serde(default)]
    current_member: Option<bool>,
    /// Terms served
    #[serde(default)]
    terms: Option<Vec<Term>>,
    /// URL to sponsored legislation
    #[serde(default)]
    sponsored_legislation: Option<ApiLink>,
    /// URL to cosponsored legislation
    #[serde(default)]
    cosponsored_legislation: Option<ApiLink>,
}

/// Term information
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Term {
    /// Chamber (Senate or House)
    #[serde(default)]
    chamber: Option<String>,
    /// State code
    #[serde(default)]
    state_code: Option<String>,
    /// State name
    #[serde(default)]
    state_name: Option<String>,
    /// Party code
    #[serde(default)]
    party_code: Option<String>,
    /// Party name
    #[serde(default)]
    party_name: Option<String>,
    /// Start year
    #[serde(default)]
    start_year: Option<u32>,
    /// End year (None if current)
    #[serde(default)]
    end_year: Option<u32>,
}

/// Link to related API resource
#[derive(Debug, Deserialize)]
struct ApiLink {
    /// Count of items
    #[serde(default)]
    count: Option<u32>,
    /// URL to fetch items
    #[serde(default)]
    url: Option<String>,
}

/// Root response wrapper for sponsored legislation
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SponsoredLegislationResponse {
    #[serde(default)]
    sponsored_legislation: Vec<LegislationItem>,
}

/// Root response wrapper for cosponsored legislation
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CosponsoredLegislationResponse {
    #[serde(default)]
    cosponsored_legislation: Vec<LegislationItem>,
}

/// Individual legislation item
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegislationItem {
    /// Congress number
    #[serde(default)]
    congress: Option<u32>,
    /// Bill type (s, hr, sjres, etc.)
    #[serde(default, rename = "type")]
    bill_type: Option<String>,
    /// Bill number
    #[serde(default)]
    number: Option<String>,
    /// Bill title
    #[serde(default)]
    title: Option<String>,
    /// Date introduced
    #[serde(default)]
    introduced_date: Option<String>,
    /// Latest action date
    #[serde(default)]
    latest_action: Option<LatestAction>,
    /// Policy area
    #[serde(default)]
    policy_area: Option<PolicyArea>,
    /// URL to full bill details
    #[serde(default)]
    url: Option<String>,
}

/// Latest action on a bill
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LatestAction {
    /// Date of action
    #[serde(default)]
    action_date: Option<String>,
    /// Action text
    #[serde(default)]
    text: Option<String>,
}

/// Policy area classification
#[derive(Debug, Deserialize)]
struct PolicyArea {
    #[serde(default)]
    name: Option<String>,
}

// ============================================================================
// HTTP Client
// ============================================================================

/// Congress.gov API client
pub struct CongressApiClient {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
}

impl CongressApiClient {
    /// Create a new Congress.gov API client
    ///
    /// # Arguments
    /// * `config` - Application configuration (must have API key set)
    ///
    /// # Errors
    /// Returns an error if the API key is not configured
    pub fn new(config: &Config) -> Result<Self> {
        let api_key = config.require_api_key()?.to_string();

        let client = reqwest::Client::builder()
            .timeout(DEFAULT_TIMEOUT)
            .user_agent("daily_senate_update/0.1")
            .build()
            .context("Failed to build HTTP client")?;

        Ok(Self {
            client,
            api_key,
            base_url: config.congress_api_base_url.clone(),
        })
    }

    /// Build a URL with the API key query parameter
    fn build_url(&self, endpoint: &str) -> String {
        let separator = if endpoint.contains('?') { '&' } else { '?' };
        format!(
            "{}{}{}{}api_key={}",
            self.base_url, API_VERSION, endpoint, separator, self.api_key
        )
    }

    /// Make a GET request to the API
    async fn get<T: serde::de::DeserializeOwned>(&self, endpoint: &str) -> Result<T> {
        let url = self.build_url(endpoint);

        let response = self
            .client
            .get(&url)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .with_context(|| format!("Failed to fetch from Congress.gov API: {}", endpoint))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!(
                "Congress.gov API returned HTTP {}: {}",
                status,
                body.chars().take(200).collect::<String>()
            );
        }

        response
            .json::<T>()
            .await
            .with_context(|| format!("Failed to parse Congress.gov API response: {}", endpoint))
    }
}

// ============================================================================
// Member Lookup
// ============================================================================

/// Fetch member details by bioguide ID
///
/// # Arguments
/// * `config` - Application configuration
/// * `bioguide_id` - The bioguide ID of the member (e.g., "S001191")
///
/// # Returns
/// A `Senator` struct with the member's details
pub async fn fetch_member(config: &Config, bioguide_id: &str) -> Result<Senator> {
    let client = CongressApiClient::new(config)?;
    let endpoint = format!("/member/{}", bioguide_id);

    let response: MemberResponse = client
        .get(&endpoint)
        .await
        .with_context(|| format!("Failed to fetch member {}", bioguide_id))?;

    member_data_to_senator(&response.member)
}

/// Convert API member data to a Senator struct
fn member_data_to_senator(data: &MemberData) -> Result<Senator> {
    // Build the name from available fields
    let name = build_member_name(
        data.first_name.as_deref(),
        data.last_name.as_deref(),
        data.direct_order_name.as_deref(),
        data.inverted_order_name.as_deref(),
    )
    .context("Member has no name fields")?;

    // Get state from current term or top-level field
    let state = get_member_state(data).context("Member has no state information")?;

    // Get party from current term or top-level field
    let party = get_member_party(data);

    Ok(Senator::new(data.bioguide_id.clone(), name, state, party))
}

/// Build member name from available fields
fn build_member_name(
    first: Option<&str>,
    last: Option<&str>,
    direct: Option<&str>,
    inverted: Option<&str>,
) -> Option<String> {
    // Prefer first + last name
    if let (Some(f), Some(l)) = (first, last) {
        let f = f.trim();
        let l = l.trim();
        if !f.is_empty() && !l.is_empty() {
            return Some(format!("{} {}", f, l));
        }
    }

    // Fall back to direct order name
    if let Some(name) = direct {
        let name = name.trim();
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }

    // Fall back to inverted name, converting "Last, First" to "First Last"
    if let Some(name) = inverted {
        let name = name.trim();
        if !name.is_empty() {
            if let Some((last, first)) = name.split_once(',') {
                let first = first.trim();
                let last = last.trim();
                if !first.is_empty() && !last.is_empty() {
                    return Some(format!("{} {}", first, last));
                }
            }
            return Some(name.to_string());
        }
    }

    None
}

/// Get member's state from term data or top-level field
fn get_member_state(data: &MemberData) -> Option<String> {
    // Try to get state from the most recent Senate term
    if let Some(terms) = &data.terms {
        // Find the most recent Senate term
        let senate_terms: Vec<_> = terms
            .iter()
            .filter(|t| {
                t.chamber
                    .as_ref()
                    .map(|c| c.eq_ignore_ascii_case("senate"))
                    .unwrap_or(false)
            })
            .collect();

        // Sort by start year descending to get most recent
        if let Some(term) = senate_terms.iter().max_by_key(|t| t.start_year) {
            if let Some(code) = &term.state_code {
                let code = code.trim().to_uppercase();
                if code.len() == 2 {
                    return Some(code);
                }
            }
        }
    }

    // Fall back to top-level state field
    data.state
        .as_ref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| s.len() == 2)
}

/// Get member's party from term data or top-level field
fn get_member_party(data: &MemberData) -> Party {
    // Try to get party from the most recent Senate term
    if let Some(terms) = &data.terms {
        let senate_terms: Vec<_> = terms
            .iter()
            .filter(|t| {
                t.chamber
                    .as_ref()
                    .map(|c| c.eq_ignore_ascii_case("senate"))
                    .unwrap_or(false)
            })
            .collect();

        if let Some(term) = senate_terms.iter().max_by_key(|t| t.start_year) {
            if let Some(code) = &term.party_code {
                return parse_party(code);
            }
            if let Some(name) = &term.party_name {
                return parse_party_name(name);
            }
        }
    }

    // Fall back to top-level party field
    if let Some(name) = &data.party_name {
        return parse_party_name(name);
    }

    Party::Other
}

/// Parse party code (D, R, I) to Party enum
fn parse_party(code: &str) -> Party {
    match code.trim().to_uppercase().as_str() {
        "D" => Party::Democrat,
        "R" => Party::Republican,
        "I" | "ID" => Party::Independent,
        _ => Party::Other,
    }
}

/// Parse party name to Party enum
fn parse_party_name(name: &str) -> Party {
    let lower = name.trim().to_lowercase();
    if lower.contains("democrat") {
        Party::Democrat
    } else if lower.contains("republican") {
        Party::Republican
    } else if lower.contains("independent") {
        Party::Independent
    } else {
        Party::Other
    }
}

// ============================================================================
// Member Activity / Sponsored Bills
// ============================================================================

/// Fetch recent sponsored legislation for a member
///
/// # Arguments
/// * `config` - Application configuration
/// * `bioguide_id` - The bioguide ID of the member
/// * `limit` - Maximum number of items to return (default: 20)
///
/// # Returns
/// A vector of `Event` structs representing sponsored bills
pub async fn fetch_sponsored_legislation(
    config: &Config,
    bioguide_id: &str,
    limit: Option<u32>,
) -> Result<Vec<Event>> {
    let client = CongressApiClient::new(config)?;
    let limit = limit.unwrap_or(20);
    let endpoint = format!(
        "/member/{}/sponsored-legislation?limit={}",
        bioguide_id, limit
    );

    let response: SponsoredLegislationResponse = client
        .get(&endpoint)
        .await
        .with_context(|| format!("Failed to fetch sponsored legislation for {}", bioguide_id))?;

    Ok(response
        .sponsored_legislation
        .iter()
        .filter_map(|item| legislation_to_event(item, EventType::SponsoredBill, config))
        .collect())
}

/// Fetch recent cosponsored legislation for a member
///
/// # Arguments
/// * `config` - Application configuration
/// * `bioguide_id` - The bioguide ID of the member
/// * `limit` - Maximum number of items to return (default: 20)
///
/// # Returns
/// A vector of `Event` structs representing cosponsored bills
pub async fn fetch_cosponsored_legislation(
    config: &Config,
    bioguide_id: &str,
    limit: Option<u32>,
) -> Result<Vec<Event>> {
    let client = CongressApiClient::new(config)?;
    let limit = limit.unwrap_or(20);
    let endpoint = format!(
        "/member/{}/cosponsored-legislation?limit={}",
        bioguide_id, limit
    );

    let response: CosponsoredLegislationResponse = client
        .get(&endpoint)
        .await
        .with_context(|| format!("Failed to fetch cosponsored legislation for {}", bioguide_id))?;

    Ok(response
        .cosponsored_legislation
        .iter()
        .filter_map(|item| legislation_to_event(item, EventType::CosponsoredBill, config))
        .collect())
}

/// Fetch all recent activity (sponsored + cosponsored) for a member
///
/// # Arguments
/// * `config` - Application configuration
/// * `bioguide_id` - The bioguide ID of the member
/// * `limit` - Maximum number of items per category (default: 10 each)
///
/// # Returns
/// A vector of `Event` structs sorted by date (most recent first)
pub async fn fetch_member_activity(
    config: &Config,
    bioguide_id: &str,
    limit: Option<u32>,
) -> Result<Vec<Event>> {
    let limit = limit.unwrap_or(10);

    // Fetch both sponsored and cosponsored in parallel
    let (sponsored, cosponsored) = tokio::try_join!(
        fetch_sponsored_legislation(config, bioguide_id, Some(limit)),
        fetch_cosponsored_legislation(config, bioguide_id, Some(limit)),
    )?;

    let mut all_events: Vec<Event> = sponsored.into_iter().chain(cosponsored).collect();

    // Sort by timestamp descending (most recent first)
    all_events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(all_events)
}

/// Fetch activity for a member filtered to a specific date
///
/// # Arguments
/// * `config` - Application configuration
/// * `bioguide_id` - The bioguide ID of the member
/// * `date` - The date to filter activity for
///
/// # Returns
/// A vector of `Event` structs for the given date
pub async fn fetch_member_activity_for_date(
    config: &Config,
    bioguide_id: &str,
    date: NaiveDate,
) -> Result<Vec<Event>> {
    // Fetch more items to increase chance of finding ones from the target date
    let all_activity = fetch_member_activity(config, bioguide_id, Some(50)).await?;

    Ok(all_activity
        .into_iter()
        .filter(|e| e.timestamp.date_naive() == date)
        .collect())
}

/// Convert a legislation item to an Event
fn legislation_to_event(
    item: &LegislationItem,
    event_type: EventType,
    config: &Config,
) -> Option<Event> {
    // Build bill ID
    let bill_type = item.bill_type.as_deref().unwrap_or("bill");
    let bill_number = item.number.as_deref().unwrap_or("0");
    let congress = item.congress.unwrap_or(config.congress);

    let id = format!("{}-{}-{}", bill_type.to_lowercase(), congress, bill_number);

    // Get title
    let title = item
        .title
        .as_ref()
        .map(|t| truncate_title(t, 120))
        .unwrap_or_else(|| format!("{} {}", bill_type.to_uppercase(), bill_number));

    // Parse timestamp from introduced date or latest action date
    let timestamp = parse_legislation_date(item);

    // Create the event
    let mut event = Event {
        id,
        event_type,
        title,
        description: None,
        timestamp,
        congress,
        session: config.session,
        vote_result: None,
        senator_votes: None,
        url: None,
    };

    // Add description with bill details
    let mut desc_parts = Vec::new();

    if let Some(bill_type) = &item.bill_type {
        if let Some(number) = &item.number {
            desc_parts.push(format!("{} {}", bill_type.to_uppercase(), number));
        }
    }

    if let Some(policy_area) = &item.policy_area {
        if let Some(name) = &policy_area.name {
            desc_parts.push(format!("Policy Area: {}", name));
        }
    }

    if let Some(latest) = &item.latest_action {
        if let Some(text) = &latest.text {
            desc_parts.push(format!("Latest Action: {}", text));
        }
    }

    if !desc_parts.is_empty() {
        event.description = Some(desc_parts.join(" | "));
    }

    // Add URL
    if let Some(url) = &item.url {
        event.url = Some(url.clone());
    } else {
        // Construct Congress.gov URL
        let bill_type_lower = item
            .bill_type
            .as_ref()
            .map(|t| t.to_lowercase())
            .unwrap_or_else(|| "bill".to_string());
        event.url = Some(format!(
            "https://www.congress.gov/bill/{}th-congress/{}/{}",
            congress, bill_type_lower, bill_number
        ));
    }

    Some(event)
}

/// Parse date from legislation item
fn parse_legislation_date(item: &LegislationItem) -> DateTime<Utc> {
    // Try latest action date first
    if let Some(latest) = &item.latest_action {
        if let Some(date_str) = &latest.action_date {
            if let Some(dt) = parse_date_string(date_str) {
                return dt;
            }
        }
    }

    // Fall back to introduced date
    if let Some(date_str) = &item.introduced_date {
        if let Some(dt) = parse_date_string(date_str) {
            return dt;
        }
    }

    // Default to now
    Utc::now()
}

/// Parse a date string into a UTC DateTime
fn parse_date_string(date_str: &str) -> Option<DateTime<Utc>> {
    let date_str = date_str.trim();

    // Try ISO format (YYYY-MM-DD)
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        let datetime = date.and_hms_opt(12, 0, 0)?;
        return New_York
            .from_local_datetime(&datetime)
            .single()
            .map(|dt| dt.with_timezone(&Utc));
    }

    // Try full datetime
    if let Ok(dt) = DateTime::parse_from_rfc3339(date_str) {
        return Some(dt.with_timezone(&Utc));
    }

    None
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_member_name() {
        // First + Last name
        assert_eq!(
            build_member_name(Some("John"), Some("Smith"), None, None),
            Some("John Smith".to_string())
        );

        // Direct order name
        assert_eq!(
            build_member_name(None, None, Some("John Smith"), None),
            Some("John Smith".to_string())
        );

        // Inverted name
        assert_eq!(
            build_member_name(None, None, None, Some("Smith, John")),
            Some("John Smith".to_string())
        );

        // Empty values
        assert_eq!(build_member_name(None, None, None, None), None);
        assert_eq!(
            build_member_name(Some(""), Some(""), None, None),
            None
        );
    }

    #[test]
    fn test_parse_party() {
        assert_eq!(parse_party("D"), Party::Democrat);
        assert_eq!(parse_party("R"), Party::Republican);
        assert_eq!(parse_party("I"), Party::Independent);
        assert_eq!(parse_party("ID"), Party::Independent);
        assert_eq!(parse_party("X"), Party::Other);
    }

    #[test]
    fn test_parse_party_name() {
        assert_eq!(parse_party_name("Democratic"), Party::Democrat);
        assert_eq!(parse_party_name("Republican"), Party::Republican);
        assert_eq!(parse_party_name("Independent"), Party::Independent);
        assert_eq!(parse_party_name("Libertarian"), Party::Other);
    }

    #[test]
    fn test_truncate_title() {
        assert_eq!(truncate_title("Short title", 100), "Short title");

        let long_title =
            "This is a very long title that should be truncated at a word boundary to ensure readability";
        let truncated = truncate_title(long_title, 50);
        assert!(truncated.len() <= 50);
        assert!(truncated.ends_with("..."));

        // Whitespace normalization
        assert_eq!(
            truncate_title("  Multiple   spaces  ", 100),
            "Multiple spaces"
        );
    }

    #[test]
    fn test_parse_date_string() {
        // ISO format
        let dt = parse_date_string("2024-01-15").unwrap();
        assert_eq!(dt.date_naive(), NaiveDate::from_ymd_opt(2024, 1, 15).unwrap());

        // Invalid
        assert!(parse_date_string("invalid").is_none());
        assert!(parse_date_string("").is_none());
    }

    #[test]
    fn test_member_data_to_senator() {
        let data = MemberData {
            bioguide_id: "T000123".to_string(),
            direct_order_name: Some("John Test".to_string()),
            first_name: Some("John".to_string()),
            last_name: Some("Test".to_string()),
            inverted_order_name: None,
            party_name: Some("Democratic".to_string()),
            state: Some("CA".to_string()),
            current_member: Some(true),
            terms: None,
            sponsored_legislation: None,
            cosponsored_legislation: None,
        };

        let senator = member_data_to_senator(&data).unwrap();
        assert_eq!(senator.bioguide_id, "T000123");
        assert_eq!(senator.name, "John Test");
        assert_eq!(senator.state, "CA");
        assert_eq!(senator.party, Party::Democrat);
    }

    #[test]
    fn test_legislation_to_event() {
        let config = Config {
            congress_api_key: Some("test".to_string()),
            congress: 118,
            session: 2,
            senate_xml_base_url: "https://www.senate.gov/legislative/LIS/".to_string(),
            congress_api_base_url: "https://api.congress.gov/".to_string(),
        };

        let item = LegislationItem {
            congress: Some(118),
            bill_type: Some("s".to_string()),
            number: Some("1234".to_string()),
            title: Some("A bill to do something important".to_string()),
            introduced_date: Some("2024-01-15".to_string()),
            latest_action: Some(LatestAction {
                action_date: Some("2024-02-01".to_string()),
                text: Some("Referred to committee".to_string()),
            }),
            policy_area: Some(PolicyArea {
                name: Some("Government Operations".to_string()),
            }),
            url: None,
        };

        let event = legislation_to_event(&item, EventType::SponsoredBill, &config).unwrap();

        assert_eq!(event.id, "s-118-1234");
        assert_eq!(event.event_type, EventType::SponsoredBill);
        assert!(event.title.contains("bill to do something important"));
        assert!(event.description.unwrap().contains("S 1234"));
        assert!(event.url.unwrap().contains("congress.gov"));
    }

    #[test]
    fn test_get_member_state_from_terms() {
        let data = MemberData {
            bioguide_id: "T000123".to_string(),
            direct_order_name: None,
            first_name: None,
            last_name: None,
            inverted_order_name: None,
            party_name: None,
            state: Some("NY".to_string()), // Top-level state
            current_member: Some(true),
            terms: Some(vec![
                Term {
                    chamber: Some("Senate".to_string()),
                    state_code: Some("CA".to_string()),
                    state_name: None,
                    party_code: Some("D".to_string()),
                    party_name: None,
                    start_year: Some(2020),
                    end_year: None,
                },
                Term {
                    chamber: Some("House".to_string()),
                    state_code: Some("CA".to_string()),
                    state_name: None,
                    party_code: Some("D".to_string()),
                    party_name: None,
                    start_year: Some(2015),
                    end_year: Some(2019),
                },
            ]),
            sponsored_legislation: None,
            cosponsored_legislation: None,
        };

        // Should get state from most recent Senate term, not top-level
        let state = get_member_state(&data);
        assert_eq!(state, Some("CA".to_string()));
    }

    #[test]
    fn test_get_member_party_from_terms() {
        let data = MemberData {
            bioguide_id: "T000123".to_string(),
            direct_order_name: None,
            first_name: None,
            last_name: None,
            inverted_order_name: None,
            party_name: Some("Independent".to_string()), // Top-level
            state: None,
            current_member: Some(true),
            terms: Some(vec![Term {
                chamber: Some("Senate".to_string()),
                state_code: None,
                state_name: None,
                party_code: Some("D".to_string()),
                party_name: Some("Democratic".to_string()),
                start_year: Some(2020),
                end_year: None,
            }]),
            sponsored_legislation: None,
            cosponsored_legislation: None,
        };

        // Should get party from Senate term, not top-level
        let party = get_member_party(&data);
        assert_eq!(party, Party::Democrat);
    }
}
