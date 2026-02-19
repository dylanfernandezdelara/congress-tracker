import type {
  HealthResponse,
  LegislationActionItem,
  MemberActivityResponse,
  MemberActivityContext,
  MemberIndexEntry,
  SessionOverview,
  StateVotesResponse,
  VoteLedger,
} from './api'

const E2E_GENERATED_AT = '2026-01-19T18:00:00Z'
const E2E_CONGRESS = 119
const E2E_SESSION = 2

const WINDOW = {
  start_date: '2025-12-20',
  end_date: '2026-01-19',
}

export const E2E_DEFAULT_STATE = 'NY'

export const E2E_HEALTH: HealthResponse = {
  status: 'ok',
  timestamp: E2E_GENERATED_AT,
  target_state: 'ALL',
  congress: E2E_CONGRESS,
  session: E2E_SESSION,
}

export const E2E_MEMBERS: MemberIndexEntry[] = [
  { bioguide_id: 'S000148', name: 'Schumer, Charles E.', party: 'D', state: 'NY', chamber: 'Senate' },
  { bioguide_id: 'G000555', name: 'Gillibrand, Kirsten E.', party: 'D', state: 'NY', chamber: 'Senate' },
  { bioguide_id: 'C001098', name: 'Cruz, Ted', party: 'R', state: 'TX', chamber: 'Senate' },
  { bioguide_id: 'C001056', name: 'Cornyn, John', party: 'R', state: 'TX', chamber: 'Senate' },
]

const BASE_CONTEXT: MemberActivityContext = {
  floor_schedule: [
    { source: 'senate', type: 'floor_schedule', date: '2026-01-20', time: '2:00 PM', title: 'Senate convenes', summary: 'Next convene 2026-01-20 2:00 PM' },
  ],
  committee_meetings: [
    { source: 'senate', type: 'committee_meeting', date: '2026-01-21', time: '10:00 AM', committee: 'Committee on Finance', title: 'FY 2026 budget priorities', location: 'Dirksen 215' },
  ],
  daily_digest: [
    { source: 'govinfo', type: 'daily_digest', date: '2026-01-19', title: 'Congressional Record Daily Digest', url: 'https://www.govinfo.gov/app/details/CREC-2026-01-19', senate_section_url: 'https://www.govinfo.gov/app/details/CREC-2026-01-19' },
  ],
}

function buildActivity(
  member: MemberIndexEntry,
  activities: LegislationActionItem[]
): MemberActivityResponse {
  return {
    member,
    congress: E2E_CONGRESS,
    generated_at: E2E_GENERATED_AT,
    window: WINDOW,
    activities,
    context: BASE_CONTEXT,
    partial: false,
    errors: [],
  }
}

const ACTIONS: Record<string, LegislationActionItem[]> = {
  S000148: [
    { source: 'congress', type: 'legislation_action', role: 'sponsor', action_date: '2026-01-15', action_text: 'Introduced in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '210', title: 'Clean Transit Access Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/210', summary: 'Provides grants to modernize public transit fleets.', policy_area: 'Transportation', subjects: ['Public transit', 'Emissions'] }, is_recent: true },
  ],
  G000555: [
    { source: 'congress', type: 'legislation_action', role: 'sponsor', action_date: '2026-01-10', action_text: 'Introduced in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '256', title: 'Family Caregiver Relief Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/256', summary: 'Creates tax credits for family caregivers.', policy_area: 'Social welfare', subjects: ['Caregiving', 'Tax credits'] }, is_recent: true },
  ],
  C001098: [
    { source: 'congress', type: 'legislation_action', role: 'sponsor', action_date: '2026-01-17', action_text: 'Introduced in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '303', title: 'Border Infrastructure Modernization Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/303', summary: 'Funds upgrades to ports of entry.', policy_area: 'Immigration', subjects: ['Border security'] }, is_recent: true },
  ],
  C001056: [
    { source: 'congress', type: 'legislation_action', role: 'cosponsor', action_date: '2026-01-08', action_text: 'Cosponsored in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '244', title: 'Small Business Growth Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/244', summary: 'Expands SBA lending limits.', policy_area: 'Commerce', subjects: ['Small business'] }, is_recent: true },
  ],
}

export const E2E_ACTIVITY_BY_MEMBER: Record<string, MemberActivityResponse> = {
  S000148: buildActivity(E2E_MEMBERS[0], ACTIONS.S000148),
  G000555: buildActivity(E2E_MEMBERS[1], ACTIONS.G000555),
  C001098: buildActivity(E2E_MEMBERS[2], ACTIONS.C001098),
  C001056: buildActivity(E2E_MEMBERS[3], ACTIONS.C001056),
}

// ---------------------------------------------------------------------------
// Vote Ledger (mock: 3 votes, 4 senators)
// ---------------------------------------------------------------------------

export const E2E_LEDGER: VoteLedger = {
  congress: E2E_CONGRESS,
  session: E2E_SESSION,
  generated_at: E2E_GENERATED_AT,
  total_votes: 3,
  entries: [
    {
      vote_number: 14,
      vote_date: '2026-01-17',
      title: 'S. 303 — Border Infrastructure Modernization Act',
      question: 'On Passage of the Bill',
      result: 'Agreed to',
      issue: 'S. 303',
      member_votes: {
        S000148: 'Nay',
        G000555: 'Nay',
        C001098: 'Yea',
        C001056: 'Yea',
      },
    },
    {
      vote_number: 13,
      vote_date: '2026-01-15',
      title: 'S. 198 — Veterans Housing Stability Act',
      question: 'On the Motion to Invoke Cloture',
      result: 'Agreed to',
      issue: 'S. 198',
      member_votes: {
        S000148: 'Yea',
        G000555: 'Yea',
        C001098: 'Nay',
        C001056: 'Yea',
      },
    },
    {
      vote_number: 12,
      vote_date: '2026-01-15',
      title: 'S. 210 — Clean Transit Access Act',
      question: 'On Passage of the Bill',
      result: 'Agreed to',
      issue: 'S. 210',
      member_votes: {
        S000148: 'Yea',
        G000555: 'Yea',
        C001098: 'Nay',
        C001056: 'Yea',
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Session Overview (mock)
// ---------------------------------------------------------------------------

export const E2E_OVERVIEW: SessionOverview = {
  congress: E2E_CONGRESS,
  session: E2E_SESSION,
  generated_at: E2E_GENERATED_AT,
  total_votes: 3,
  latest_vote_date: '2026-01-17',
  total_defections: 2,
  senators: [
    { bioguide_id: 'S000148', name: 'Schumer, Charles E.', party: 'D', state: 'NY', votes_cast: 3, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
    { bioguide_id: 'G000555', name: 'Gillibrand, Kirsten E.', party: 'D', state: 'NY', votes_cast: 3, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
    { bioguide_id: 'C001098', name: 'Cruz, Ted', party: 'R', state: 'TX', votes_cast: 3, votes_missed: 0, party_defections: 2, alignment_pct: 33 },
    { bioguide_id: 'C001056', name: 'Cornyn, John', party: 'R', state: 'TX', votes_cast: 3, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
  ],
}

export const E2E_STATE_VOTES: Record<string, StateVotesResponse> = {
  NY: {
    state: 'NY',
    vote_date: '2026-01-15',
    generated_at: E2E_GENERATED_AT,
    congress: E2E_CONGRESS,
    session: E2E_SESSION,
    votes: [
      {
        vote_number: 12,
        title: 'S. 210 — Clean Transit Access Act',
        question: 'On Passage of the Bill',
        result: 'Agreed to',
        issue: 'S. 210',
        issue_type: 'bill',
        bill: { congress: E2E_CONGRESS, type: 'S', number: '210', title: 'Clean Transit Access Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/210' },
        counts: { yeas: 67, nays: 32, present: 1, absent: 0 },
        members: [
          { name: 'Schumer (D-NY)', state: 'NY', party: 'D', vote_cast: 'Yea' },
          { name: 'Gillibrand (D-NY)', state: 'NY', party: 'D', vote_cast: 'Yea' },
        ],
      },
    ],
  },
}
