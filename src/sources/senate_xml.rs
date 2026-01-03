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
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::config::Config;
use crate::models::senator::{Party, Senator};

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
    let content_type = resp
        .headers()
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
}

