// Configuration module

use anyhow::Result;

#[cfg(feature = "congress-api")]
use anyhow::Context;

/// Configuration for the application
pub struct Config {
    /// Current Congress number (default: 119)
    pub congress: u32,
    /// Current session number (default: 1)
    pub session: u32,
    /// Base URL for Senate XML endpoints
    pub senate_xml_base_url: String,

    /// Congress.gov API key loaded from environment.
    ///
    /// Post-MVP: this is only needed for the legacy `congress-api` feature; the Worker pipeline
    /// and Rust vote parsing do not require it.
    #[cfg(feature = "congress-api")]
    pub congress_api_key: Option<String>,

    /// Base URL for Congress.gov API (legacy; only used with the `congress-api` feature)
    #[cfg(feature = "congress-api")]
    pub congress_api_base_url: String,
}

impl Config {
    /// Load configuration from environment variables
    /// 
    /// Loads `CONGRESS_API_KEY` from `.env` file using dotenvy (optional; legacy only).
    /// Sets defaults for congress/session numbers and base URLs.
    pub fn load() -> Result<Self> {
        // Load .env file (ignore errors if it doesn't exist)
        let _ = dotenvy::dotenv();

        #[cfg(feature = "congress-api")]
        let congress_api_key = std::env::var("CONGRESS_API_KEY")
            .ok()
            .filter(|s| !s.is_empty());

        Ok(Config {
            congress: 119, // Default to 119th Congress (2025-2026)
            session: 1,    // Default to 1st session
            senate_xml_base_url: "https://www.senate.gov/legislative/LIS/".to_string(),

            #[cfg(feature = "congress-api")]
            congress_api_key,
            #[cfg(feature = "congress-api")]
            congress_api_base_url: "https://api.congress.gov/".to_string(),
        })
    }
    
    /// Get the Congress.gov API key, returning an error if not set
    #[cfg(feature = "congress-api")]
    pub fn require_api_key(&self) -> Result<&str> {
        self.congress_api_key
            .as_deref()
            .context("CONGRESS_API_KEY not set in environment. Please set it in .env file.")
    }
    
    /// Construct URL for Senate member data XML
    pub fn senate_member_data_url(&self) -> String {
        format!("{}LIS_MEMBER/cvc_member_data.xml", self.senate_xml_base_url)
    }
    
    /// Construct URL for Senate roll call vote list XML
    pub fn senate_vote_list_url(&self) -> String {
        format!(
            "{}roll_call_lists/vote_menu_{}_{}.xml",
            self.senate_xml_base_url, self.congress, self.session
        )
    }
    
    /// Construct URL for a specific Senate roll call vote XML
    pub fn senate_vote_url(&self, vote_number: u32) -> String {
        format!(
            "{}roll_call_votes/vote{}{}/vote_{}_{}_{:05}.xml",
            self.senate_xml_base_url,
            self.congress,
            self.session,
            self.congress,
            self.session,
            vote_number
        )
    }
    
    /// Construct URL for Senate floor activity XML
    pub fn senate_floor_activity_url(&self, date_str: &str) -> String {
        format!(
            "{}floor_activity/{}_Senate_Floor.xml",
            self.senate_xml_base_url, date_str
        )
    }
}

