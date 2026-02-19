# Committee Data Availability Notes

This note captures the current assessment of whether we can ingest committee
membership and committee press releases, plus the most practical sources.

## Summary

- Committee membership ingestion is feasible now using the public
  `committee-membership-current` dataset from `unitedstates/congress-legislators`.
- Committee press ingestion is feasible, but it requires RSS polling when
  available and site-specific scraping as a fallback.
- The Congress.gov Committee API provides committee metadata and site URLs,
  but does not publish committee member rosters in its documented responses.

## Committee Membership

### Feasibility

Yes. The most reliable source of current committee membership is the
`committee-membership-current` dataset published by the `unitedstates` project.
It includes membership rosters keyed by bioguide IDs, which can be joined to
our senator index.

### Recommended source

- `committee-membership-current.json` (or YAML/CSV) from
  `unitedstates/congress-legislators`
- `committees-current.json` for committee metadata and useful fields like RSS
  feed URLs

Reference:
- https://github.com/unitedstates/congress-legislators

### Notes / caveats

- The dataset is current only (no historical assignments).
- Committee IDs are keyed to committee codes used in the committees files.
- We should store the membership snapshot date to track staleness.

## Committee Press Releases

### Feasibility

Yes, but not via a unified API. Committee press is not exposed in the
Congress.gov API in a standardized way. Most committee press lives on
committee-specific sites, many of which publish RSS feeds.

### Recommended approach

1. Build a small committee-source registry:
   - committee name
   - official site URL
   - RSS URL(s) when available
2. Poll RSS feeds where available.
3. Add site-specific scraping rules as a fallback.

Example committee press page:
- https://www.foreign.senate.gov/press/dem/release/ranking-member-shaheen-pushes-for-congress-to-prohibit-taking-greenland-by-passing-the-nato-unity-protection-act

### Attribution to members

For each press item:
- Attempt to detect an explicit member name or title in the press content.
- If the press is under a "Chairman" or "Ranking Member" section, attribute
  to the current chair or ranking member for that committee.
- Record attribution confidence (explicit name vs inferred role).

## Congress.gov Committee API (what it gives us)

The Congress.gov Committee API provides committee metadata, including:
- committee names and system codes
- chamber and committee type
- committee website URL

It does not publish committee membership rosters in the documented responses.

Reference:
- https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/CommitteeEndpoint.md?plain=1

## Next steps if we proceed

- Add ingestion job for `committee-membership-current.json` and
  `committees-current.json`.
- Define a `committee_membership` dataset output (snapshot + members list).
- Create a `committee_press` activity type and store:
  committee, date, title, url, attributed member(s), and confidence.
