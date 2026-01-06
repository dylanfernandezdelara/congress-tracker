pub mod senate_xml;

// Legacy Congress.gov client (not used by the Worker ingestion pipeline).
// Kept behind a feature to reduce maintenance/compile surface area post-MVP.
#[cfg(feature = "congress-api")]
pub mod congress_api;

