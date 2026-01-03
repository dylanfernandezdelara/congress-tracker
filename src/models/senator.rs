// Senator model definition

use serde::{Deserialize, Serialize};

/// Represents a US Senator with basic biographical information.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Senator {
    /// Bioguide ID - unique identifier used by Congress.gov (e.g., "S001191")
    pub bioguide_id: String,
    /// Full name of the senator (e.g., "Kyrsten Sinema")
    pub name: String,
    /// Two-letter state abbreviation (e.g., "AZ")
    pub state: String,
    /// Political party affiliation
    pub party: Party,
}

/// Political party affiliation for a senator.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Party {
    /// Democratic Party
    #[serde(rename = "D")]
    Democrat,
    /// Republican Party
    #[serde(rename = "R")]
    Republican,
    /// Independent
    #[serde(rename = "I")]
    Independent,
    /// Any other party affiliation
    #[serde(other)]
    Other,
}

impl std::fmt::Display for Party {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Party::Democrat => write!(f, "D"),
            Party::Republican => write!(f, "R"),
            Party::Independent => write!(f, "I"),
            Party::Other => write!(f, "O"),
        }
    }
}

impl Senator {
    /// Creates a new Senator instance.
    pub fn new(bioguide_id: impl Into<String>, name: impl Into<String>, state: impl Into<String>, party: Party) -> Self {
        Self {
            bioguide_id: bioguide_id.into(),
            name: name.into(),
            state: state.into(),
            party,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_senator_creation() {
        let senator = Senator::new("S001191", "Kyrsten Sinema", "AZ", Party::Independent);
        assert_eq!(senator.bioguide_id, "S001191");
        assert_eq!(senator.name, "Kyrsten Sinema");
        assert_eq!(senator.state, "AZ");
        assert_eq!(senator.party, Party::Independent);
    }

    #[test]
    fn test_senator_serialization() {
        let senator = Senator::new("F000062", "Dianne Feinstein", "CA", Party::Democrat);
        let json = serde_json::to_string(&senator).unwrap();
        assert!(json.contains("\"party\":\"D\""));
        assert!(json.contains("\"state\":\"CA\""));
    }

    #[test]
    fn test_senator_deserialization() {
        let json = r#"{"bioguide_id":"M000355","name":"Mitch McConnell","state":"KY","party":"R"}"#;
        let senator: Senator = serde_json::from_str(json).unwrap();
        assert_eq!(senator.party, Party::Republican);
        assert_eq!(senator.name, "Mitch McConnell");
    }

    #[test]
    fn test_party_display() {
        assert_eq!(format!("{}", Party::Democrat), "D");
        assert_eq!(format!("{}", Party::Republican), "R");
        assert_eq!(format!("{}", Party::Independent), "I");
        assert_eq!(format!("{}", Party::Other), "O");
    }
}
