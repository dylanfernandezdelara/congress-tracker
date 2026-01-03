use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents the type of Senate event
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    /// A roll call vote in the Senate
    Vote,
    /// Floor activity or proceedings
    FloorActivity,
    /// A bill sponsored by a senator
    SponsoredBill,
    /// A bill co-sponsored by a senator
    CosponsoredBill,
    /// Committee activity
    Committee,
    /// Other miscellaneous event
    Other,
}

impl std::fmt::Display for EventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventType::Vote => write!(f, "Vote"),
            EventType::FloorActivity => write!(f, "Floor Activity"),
            EventType::SponsoredBill => write!(f, "Sponsored Bill"),
            EventType::CosponsoredBill => write!(f, "Co-Sponsored Bill"),
            EventType::Committee => write!(f, "Committee"),
            EventType::Other => write!(f, "Other"),
        }
    }
}

/// Represents how a senator voted on a particular measure
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VotePosition {
    Yea,
    Nay,
    Present,
    NotVoting,
}

impl std::fmt::Display for VotePosition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VotePosition::Yea => write!(f, "Yea"),
            VotePosition::Nay => write!(f, "Nay"),
            VotePosition::Present => write!(f, "Present"),
            VotePosition::NotVoting => write!(f, "Not Voting"),
        }
    }
}

/// Represents a senator's vote on a particular measure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SenatorVote {
    /// Bioguide ID of the senator
    pub bioguide_id: String,
    /// Senator's name
    pub name: String,
    /// Senator's state
    pub state: String,
    /// Senator's party
    pub party: String,
    /// How the senator voted
    pub position: VotePosition,
}

/// The result of a vote
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoteResult {
    /// Number of Yea votes
    pub yeas: u32,
    /// Number of Nay votes
    pub nays: u32,
    /// Number of Present votes
    pub present: u32,
    /// Number of Not Voting
    pub not_voting: u32,
    /// Whether the measure passed
    pub passed: bool,
}

/// Represents a Senate event (vote, floor activity, bill sponsorship, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// Unique identifier for the event (e.g., vote number, bill number)
    pub id: String,
    /// Type of event
    pub event_type: EventType,
    /// Title or brief description
    pub title: String,
    /// Detailed description (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// When the event occurred
    pub timestamp: DateTime<Utc>,
    /// Congress number (e.g., 118)
    pub congress: u32,
    /// Session number (1 or 2)
    pub session: u32,
    /// Vote result details (only for Vote events)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote_result: Option<VoteResult>,
    /// Individual senator votes (only for Vote events)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub senator_votes: Option<Vec<SenatorVote>>,
    /// URL to more information (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

impl Event {
    /// Create a new vote event
    pub fn new_vote(
        id: String,
        title: String,
        timestamp: DateTime<Utc>,
        congress: u32,
        session: u32,
    ) -> Self {
        Self {
            id,
            event_type: EventType::Vote,
            title,
            description: None,
            timestamp,
            congress,
            session,
            vote_result: None,
            senator_votes: None,
            url: None,
        }
    }

    /// Create a new floor activity event
    pub fn new_floor_activity(
        id: String,
        title: String,
        timestamp: DateTime<Utc>,
        congress: u32,
        session: u32,
    ) -> Self {
        Self {
            id,
            event_type: EventType::FloorActivity,
            title,
            description: None,
            timestamp,
            congress,
            session,
            vote_result: None,
            senator_votes: None,
            url: None,
        }
    }

    /// Create a new sponsored bill event
    pub fn new_sponsored_bill(
        id: String,
        title: String,
        timestamp: DateTime<Utc>,
        congress: u32,
        session: u32,
    ) -> Self {
        Self {
            id,
            event_type: EventType::SponsoredBill,
            title,
            description: None,
            timestamp,
            congress,
            session,
            vote_result: None,
            senator_votes: None,
            url: None,
        }
    }

    /// Set the description
    pub fn with_description(mut self, description: String) -> Self {
        self.description = Some(description);
        self
    }

    /// Set the vote result
    pub fn with_vote_result(mut self, result: VoteResult) -> Self {
        self.vote_result = Some(result);
        self
    }

    /// Set the senator votes
    pub fn with_senator_votes(mut self, votes: Vec<SenatorVote>) -> Self {
        self.senator_votes = Some(votes);
        self
    }

    /// Set the URL
    pub fn with_url(mut self, url: String) -> Self {
        self.url = Some(url);
        self
    }
}
