// Configuration module

use anyhow::{Context, Result};

/// Configuration for the application
pub struct Config {
    /// Congress.gov API key loaded from environment
    pub congress_api_key: Option<String>,
    /// Current Congress number (default: 118)
    pub congress: u32,
    /// Current session number (default: 2)
    pub session: u32,
    /// Base URL for Senate XML endpoints
    pub senate_xml_base_url: String,
    /// Base URL for Congress.gov API
    pub congress_api_base_url: String,
}

impl Config {
    /// Load configuration from environment variables
    /// 
    /// Loads `CONGRESS_API_KEY` from `.env` file using dotenvy.
    /// Sets defaults for congress/session numbers and base URLs.
    pub fn load() -> Result<Self> {
        // Load .env file (ignore errors if it doesn't exist)
        let _ = dotenvy::dotenv();
        
        let congress_api_key = std::env::var("CONGRESS_API_KEY")
            .ok()
            .filter(|s| !s.is_empty());
        
        Ok(Config {
            congress_api_key,
            congress: 118, // Default to 118th Congress
            session: 2,    // Default to 2nd session
            senate_xml_base_url: "https://www.senate.gov/legislative/LIS/".to_string(),
            congress_api_base_url: "https://api.congress.gov/".to_string(),
        })
    }
    
    /// Get the Congress.gov API key, returning an error if not set
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
    
    /// Construct URL for Congress.gov API endpoint
    pub fn congress_api_url(&self, endpoint: &str) -> String {
        format!("{}{}", self.congress_api_base_url, endpoint)
    }
}

