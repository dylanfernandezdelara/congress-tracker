// Senators command implementation

use anyhow::{bail, Result};

use crate::cli::output::print_senators;
use crate::config::Config;
use crate::sources::senate_xml::fetch_senators_for_state;

/// Valid US state abbreviations for validation and error messages
const VALID_STATES: &[&str] = &[
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

/// Run the senators command to display senators for a given state.
///
/// # Arguments
/// * `config` - Application configuration
/// * `state` - Two-letter state abbreviation (e.g., "CA", "TX")
/// * `json` - If true, output as JSON; otherwise output as a formatted table
///
/// # Errors
/// Returns an error if:
/// - The state code is invalid (not a 2-letter US state abbreviation)
/// - The network request fails
/// - Senators cannot be found for the given state
pub async fn run_senators_command(config: &Config, state: &str, json: bool) -> Result<()> {
    // Validate and normalize state code
    let state = validate_state_code(state)?;

    // Fetch senators for the state
    let senators = fetch_senators_for_state(config, &state).await?;

    // Print the senators (convert array to slice)
    print_senators(&senators, json);

    Ok(())
}

/// Validate that the given state code is a valid 2-letter US state abbreviation.
///
/// Returns the uppercase normalized state code on success, or an error with
/// helpful suggestions on failure.
fn validate_state_code(state: &str) -> Result<String> {
    let state = state.trim().to_uppercase();

    if state.len() != 2 {
        bail!(
            "State must be a 2-letter abbreviation (got '{}').\n\
             Examples: CA, TX, NY, FL",
            state
        );
    }

    if !VALID_STATES.contains(&state.as_str()) {
        bail!(
            "Invalid state code '{}'. Please use a valid 2-letter US state abbreviation.\n\
             Examples: CA, TX, NY, FL",
            state
        );
    }

    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_state_code_valid() {
        assert_eq!(validate_state_code("CA").unwrap(), "CA");
        assert_eq!(validate_state_code("ca").unwrap(), "CA");
        assert_eq!(validate_state_code("  TX  ").unwrap(), "TX");
        assert_eq!(validate_state_code("ny").unwrap(), "NY");
    }

    #[test]
    fn test_validate_state_code_invalid_length() {
        let err = validate_state_code("C").unwrap_err();
        assert!(err.to_string().contains("2-letter"));

        let err = validate_state_code("CAL").unwrap_err();
        assert!(err.to_string().contains("2-letter"));
    }

    #[test]
    fn test_validate_state_code_invalid_state() {
        let err = validate_state_code("XX").unwrap_err();
        assert!(err.to_string().contains("Invalid state code"));
        assert!(err.to_string().contains("XX"));
    }
}
