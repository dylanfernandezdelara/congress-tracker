import type {
  ActivityIndexResponse,
  BriefingFeedResponse,
  HealthResponse,
  LegislationActionItem,
  MemberActivityResponse,
  MemberActivityContext,
  MemberIndexEntry,
  SessionOverview,
  StateVotesResponse,
  VoteDetailResponse,
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
    { source: 'congress', type: 'legislation_action', role: 'sponsor', action_date: '2026-01-15', action_text: 'Introduced in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '210', title: 'Clean Transit Access Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/210', summary: 'Provides grants to modernize public transit fleets.', policy_area: 'Transportation', subjects: ['Public transit', 'Emissions'], analysis: { plain_title: 'Cleaner buses for public transit', plain_summary: 'Creates grants to help transit agencies replace old buses with cleaner vehicles.', key_provisions: ['Transit agencies can apply for federal fleet-modernization grants.', 'Funding supports cleaner buses and related infrastructure upgrades.'], why_it_matters: 'Could improve air quality and commuting reliability in cities using public transit.', hidden_provisions: null, significance: 'high', significance_reason: 'This bill affects daily transportation and local transit budgets.', category: 'Public Transit', affects: ['Transit riders', 'City transit agencies', 'Local taxpayers'] } }, is_recent: true },
  ],
  G000555: [
    { source: 'congress', type: 'legislation_action', role: 'sponsor', action_date: '2026-01-10', action_text: 'Introduced in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '256', title: 'Family Caregiver Relief Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/256', summary: 'Creates tax credits for family caregivers.', policy_area: 'Social welfare', subjects: ['Caregiving', 'Tax credits'], analysis: { plain_title: 'Tax relief for family caregivers', plain_summary: 'Offers tax credits to people who care for relatives at home.', key_provisions: ['Creates a new tax credit for eligible caregivers.', 'Targets families paying out-of-pocket caregiving costs.'], why_it_matters: 'Could reduce financial pressure for families caring for aging parents or disabled relatives.', hidden_provisions: null, significance: 'medium', significance_reason: 'Meaningful for affected families but narrower than economy-wide bills.', category: 'Family Caregiving', affects: ['Family caregivers', 'Older adults', 'Households with care expenses'] } }, is_recent: true },
  ],
  C001098: [
    { source: 'congress', type: 'legislation_action', role: 'sponsor', action_date: '2026-01-17', action_text: 'Introduced in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '303', title: 'Border Infrastructure Modernization Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/303', summary: 'Funds upgrades to ports of entry.', policy_area: 'Immigration', subjects: ['Border security'], analysis: { plain_title: 'Upgrade border crossing infrastructure', plain_summary: 'Funds improvements at ports of entry to process people and goods more efficiently.', key_provisions: ['Provides federal funding for port-of-entry modernization.', 'Supports infrastructure upgrades tied to border operations.'], why_it_matters: 'Could affect border wait times, trade logistics, and federal spending priorities.', hidden_provisions: null, significance: 'high', significance_reason: 'Large federal infrastructure spending with national security implications.', category: 'Border Security', affects: ['Border communities', 'Importers and exporters', 'Travelers'] } }, is_recent: true },
  ],
  C001056: [
    { source: 'congress', type: 'legislation_action', role: 'cosponsor', action_date: '2026-01-08', action_text: 'Cosponsored in Senate', bill: { congress: E2E_CONGRESS, type: 'S', number: '244', title: 'Small Business Growth Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/244', summary: 'Expands SBA lending limits.', policy_area: 'Commerce', subjects: ['Small business'], analysis: { plain_title: 'Raise lending support for small businesses', plain_summary: 'Increases SBA-backed lending limits to make financing more available for small firms.', key_provisions: ['Raises limits for qualifying SBA-backed loans.', 'Aims to widen access to growth capital for small businesses.'], why_it_matters: 'Could make it easier for local businesses to borrow and expand.', hidden_provisions: null, significance: 'medium', significance_reason: 'Important to business financing but narrower than broad appropriations bills.', category: 'Small Business Finance', affects: ['Small business owners', 'Workers at small firms', 'Local lenders'] } }, is_recent: true },
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

// ---------------------------------------------------------------------------
// Activities Index (mock)
// ---------------------------------------------------------------------------

export const E2E_ACTIVITIES: ActivityIndexResponse = {
  generated_at: E2E_GENERATED_AT,
  window: WINDOW,
  activities: [
    {
      activity_id: 'senate:roll_call_vote:2026-01-17:14',
      source: 'senate',
      type: 'roll_call_vote',
      date: '2026-01-17',
      title: 'S. 303 — Border Infrastructure Modernization Act',
      bill: { congress: E2E_CONGRESS, type: 'S', number: '303', title: 'Border Infrastructure Modernization Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/303', summary: 'Funds upgrades to ports of entry along the southern and northern borders.', policy_area: 'Immigration', subjects: ['Border security', 'Infrastructure'], analysis: { plain_title: 'Upgrade border crossing infrastructure', plain_summary: 'Funds major improvements at border entry points to handle travel and trade more effectively.', key_provisions: ['Pays for infrastructure upgrades at ports of entry.', 'Targets processing capacity and facility modernization.'], why_it_matters: 'Can influence border wait times, commerce flow, and federal spending priorities.', hidden_provisions: null, significance: 'high', significance_reason: 'National infrastructure and border policy impacts are broad and high-stakes.', category: 'Border Security', affects: ['Border communities', 'Travelers', 'Import/export businesses'] } },
      topics: ['Immigration', 'Border security'],
      members: ['C001098', 'C001056', 'S000148', 'G000555'],
    },
    {
      activity_id: 'senate:roll_call_vote:2026-01-15:13',
      source: 'senate',
      type: 'roll_call_vote',
      date: '2026-01-15',
      title: 'S. 198 — Veterans Housing Stability Act',
      bill: { congress: E2E_CONGRESS, type: 'S', number: '198', title: 'Veterans Housing Stability Act', summary: 'Expands housing assistance and rental vouchers for veterans at risk of homelessness.', policy_area: 'Armed forces and national security', subjects: ['Veterans', 'Housing'], analysis: { plain_title: 'Expand housing support for veterans', plain_summary: 'Increases housing assistance and vouchers for veterans facing housing instability.', key_provisions: ['Expands rental voucher support for eligible veterans.', 'Targets veterans at risk of homelessness.'], why_it_matters: 'Could reduce veteran homelessness and pressure on local emergency housing programs.', hidden_provisions: null, significance: 'high', significance_reason: 'Directly addresses a severe social outcome for a large vulnerable group.', category: 'Veterans Housing', affects: ['Veterans at risk of homelessness', 'Veterans families', 'Local housing programs'] } },
      topics: ['Veterans', 'Housing'],
      members: ['S000148', 'G000555', 'C001098', 'C001056'],
    },
    {
      activity_id: 'senate:roll_call_vote:2026-01-15:12',
      source: 'senate',
      type: 'roll_call_vote',
      date: '2026-01-15',
      title: 'S. 210 — Clean Transit Access Act',
      bill: { congress: E2E_CONGRESS, type: 'S', number: '210', title: 'Clean Transit Access Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/210', summary: 'Provides grants to modernize public transit fleets with zero-emission vehicles.', policy_area: 'Transportation', subjects: ['Public transit', 'Emissions'], analysis: { plain_title: 'Cleaner buses for public transit', plain_summary: 'Creates grants to help transit agencies replace older fleets with zero-emission vehicles.', key_provisions: ['Federal grants for fleet replacement and modernization.', 'Supports transition to cleaner transit operations.'], why_it_matters: 'Could improve local air quality and public transit service quality.', hidden_provisions: null, significance: 'high', significance_reason: 'Large local quality-of-life impact through transportation systems.', category: 'Public Transit', affects: ['Transit riders', 'Urban residents', 'Transit agencies'] } },
      topics: ['Transportation', 'Emissions'],
      members: ['S000148', 'G000555', 'C001098', 'C001056'],
    },
    {
      activity_id: 'senate:floor_schedule:2026-01-20',
      source: 'senate',
      type: 'floor_schedule',
      date: '2026-01-20',
      title: 'Senate convenes — consideration of S. 256 Family Caregiver Relief Act',
      bill: { congress: E2E_CONGRESS, type: 'S', number: '256', title: 'Family Caregiver Relief Act', summary: 'Creates tax credits for family caregivers.', policy_area: 'Social welfare', subjects: ['Caregiving', 'Tax credits'], analysis: { plain_title: 'Tax relief for family caregivers', plain_summary: 'Provides tax credits for households caring for family members at home.', key_provisions: ['Creates a tax credit for qualified caregiving costs.', 'Focuses on family-based care support.'], why_it_matters: 'Could lower costs for families providing unpaid or underpaid care.', hidden_provisions: null, significance: 'medium', significance_reason: 'Significant for affected households but targeted rather than economy-wide.', category: 'Family Caregiving', affects: ['Family caregivers', 'Older adults', 'Households with medical care expenses'] } },
      topics: ['Social welfare', 'Tax credits'],
      members: [],
    },
    {
      activity_id: 'senate:committee_meeting:2026-01-21:finance',
      source: 'senate',
      type: 'committee_meeting',
      date: '2026-01-21',
      title: 'Committee on Finance — FY 2026 budget priorities hearing',
      topics: ['Budget', 'Finance'],
      members: [],
    },
  ],
  featured_senators: [
    { bioguide_id: 'C001056', score: 82, reasons: ['Crossed party line on 2 of 3 recent votes', 'Key swing vote on Border Infrastructure bill'], latest_activity_date: '2026-01-17' },
    { bioguide_id: 'C001098', score: 65, reasons: ['Sponsored Border Infrastructure Modernization Act', 'Active in Immigration committee'], latest_activity_date: '2026-01-17' },
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
        bill: { congress: E2E_CONGRESS, type: 'S', number: '210', title: 'Clean Transit Access Act', url: 'https://www.congress.gov/bill/119th-congress/senate-bill/210', analysis: { plain_title: 'Cleaner buses for public transit', plain_summary: 'Creates grants to modernize transit fleets with cleaner vehicles.', key_provisions: ['Supports transit fleet replacement with low-emission buses.'], why_it_matters: 'Can improve transit reliability and local air quality.', hidden_provisions: null, significance: 'high', significance_reason: 'Public transit and air quality impacts are broad and visible.', category: 'Public Transit', affects: ['Transit riders', 'Urban residents', 'Transit agencies'] } },
        counts: { yeas: 67, nays: 32, present: 1, absent: 0 },
        members: [
          { name: 'Schumer (D-NY)', state: 'NY', party: 'D', vote_cast: 'Yea' },
          { name: 'Gillibrand (D-NY)', state: 'NY', party: 'D', vote_cast: 'Yea' },
        ],
      },
    ],
  },
}

export const E2E_BRIEFING: BriefingFeedResponse = {
  generated_at: E2E_GENERATED_AT,
  source: 'derived',
  coverage_note: 'Demo data uses vote and bill context with limited excerpt-level evidence.',
  items: [
    {
      id: '119:2:14',
      congress: E2E_CONGRESS,
      session: E2E_SESSION,
      vote_number: 14,
      vote_date: '2026-01-17',
      title: 'Border Infrastructure Modernization Act',
      summary: 'Funds major improvements at border entry points to handle travel and trade more effectively.',
      outcome_label: 'Passed the Senate hurdle',
      status: 'passed',
      category: 'Border Security',
      significance: 'high',
      bill: E2E_ACTIVITIES.activities[0].bill,
      tally: { yea: 2, nay: 2, present: 0, absent: 0 },
      crossed_party_lines: [],
      ranking_reasons: [
        { code: 'close_vote', label: 'Close vote' },
        { code: 'national_security', label: 'National security implications' },
      ],
      source_coverage: {
        level: 'partial',
        vote_data: true,
        bill_context: true,
        congressional_record: false,
        floor_logs: false,
        model_summary: true,
        note: 'Vote and bill context are available, but excerpt-level official sources are limited in demo mode.',
      },
      detail_path: '/votes/119/2/14',
      score: 87,
    },
    {
      id: '119:2:12',
      congress: E2E_CONGRESS,
      session: E2E_SESSION,
      vote_number: 12,
      vote_date: '2026-01-15',
      title: 'Clean Transit Access Act',
      summary: 'Creates grants to help transit agencies replace older fleets with zero-emission vehicles.',
      outcome_label: 'Passed the Senate hurdle',
      status: 'passed',
      category: 'Public Transit',
      significance: 'high',
      bill: E2E_ACTIVITIES.activities[2].bill,
      tally: { yea: 3, nay: 1, present: 0, absent: 0 },
      crossed_party_lines: [
        {
          bioguide_id: 'C001056',
          name: 'Cornyn',
          party: 'R',
          state: 'TX',
          vote_cast: 'yea',
        },
      ],
      ranking_reasons: [
        { code: 'cross_party', label: 'Cross-party votes' },
        { code: 'broad_impact', label: 'Broad public impact' },
      ],
      source_coverage: {
        level: 'partial',
        vote_data: true,
        bill_context: true,
        congressional_record: false,
        floor_logs: false,
        model_summary: true,
      },
      detail_path: '/votes/119/2/12',
      score: 74,
    },
  ],
}

export const E2E_VOTE_DETAILS: Record<string, VoteDetailResponse> = {
  '119:2:14': {
    generated_at: E2E_GENERATED_AT,
    source: 'derived',
    vote: {
      id: '119:2:14',
      congress: E2E_CONGRESS,
      session: E2E_SESSION,
      vote_number: 14,
      vote_date: '2026-01-17',
      title: 'Border Infrastructure Modernization Act',
      question: 'On Passage of the Bill',
      result: 'Agreed to',
      issue: 'S. 303',
      bill: E2E_ACTIVITIES.activities[0].bill,
      tally: { yea: 2, nay: 2, present: 0, absent: 0 },
      status: 'passed',
    },
    procedural_context: {
      step_type: 'passage',
      question: 'On Passage of the Bill',
    },
    party_breakdown: [
      { party: 'D', yea: 0, nay: 2, present: 0, not_voting: 0, majority_vote: 'nay' },
      { party: 'R', yea: 2, nay: 0, present: 0, not_voting: 0, majority_vote: 'yea' },
    ],
    crossovers: [],
    history: {
      thread_key: '119:S:303',
      measure_recurrence_count: 1,
      issue_key: 'topic:border-infrastructure-modernization',
      issue_title: 'Border Infrastructure Modernization Act',
      issue_recurrence_count: 1,
      first_seen_vote_date: '2026-01-17',
      related_votes: [],
    },
    arguments: {
      available: true,
      coverage_note: 'Argument summaries use bill analysis in demo mode because official excerpts are limited.',
      parties: [
        {
          party: 'D',
          stance: 'oppose',
          summary: 'Demo summary: Democrats were shown as opposing the measure on the recorded vote.',
          confidence: 'medium',
          evidence_points: ['0 voted Yea, 2 voted Nay'],
          excerpt_ids: [],
          coverage_note: 'Derived from vote behavior in demo mode.',
        },
        {
          party: 'R',
          stance: 'support',
          summary: 'Demo summary: Republicans were shown as supporting the measure on the recorded vote.',
          confidence: 'medium',
          evidence_points: ['2 voted Yea, 0 voted Nay'],
          excerpt_ids: [],
          coverage_note: 'Derived from vote behavior in demo mode.',
        },
      ],
      excerpts: [],
    },
    ranking_reasons: [
      { code: 'close_vote', label: 'Close vote' },
      { code: 'national_security', label: 'National security implications' },
    ],
    source_coverage: {
      level: 'partial',
      vote_data: true,
      bill_context: true,
      congressional_record: false,
      floor_logs: false,
      model_summary: true,
      note: 'Demo mode omits excerpt-level official sources.',
    },
  },
  '119:2:12': {
    generated_at: E2E_GENERATED_AT,
    source: 'derived',
    vote: {
      id: '119:2:12',
      congress: E2E_CONGRESS,
      session: E2E_SESSION,
      vote_number: 12,
      vote_date: '2026-01-15',
      title: 'Clean Transit Access Act',
      question: 'On Passage of the Bill',
      result: 'Agreed to',
      issue: 'S. 210',
      bill: E2E_ACTIVITIES.activities[2].bill,
      tally: { yea: 3, nay: 1, present: 0, absent: 0 },
      status: 'passed',
    },
    procedural_context: {
      step_type: 'passage',
      question: 'On Passage of the Bill',
    },
    party_breakdown: [
      { party: 'D', yea: 2, nay: 0, present: 0, not_voting: 0, majority_vote: 'yea' },
      { party: 'R', yea: 1, nay: 1, present: 0, not_voting: 0, majority_vote: 'yea' },
    ],
    crossovers: [
      {
        bioguide_id: 'C001056',
        name: 'Cornyn',
        party: 'R',
        state: 'TX',
        vote_cast: 'yea',
      },
    ],
    history: {
      thread_key: '119:S:210',
      measure_recurrence_count: 1,
      issue_key: 'topic:clean-transit-access',
      issue_title: 'Clean Transit Access Act',
      issue_recurrence_count: 1,
      first_seen_vote_date: '2026-01-15',
      related_votes: [],
    },
    arguments: {
      available: true,
      coverage_note: 'Argument summaries use bill analysis in demo mode because official excerpts are limited.',
      parties: [
        {
          party: 'D',
          stance: 'support',
          summary: 'Demo summary: Democrats supported the transit grants package.',
          confidence: 'medium',
          evidence_points: ['2 voted Yea, 0 voted Nay'],
          excerpt_ids: [],
        },
        {
          party: 'R',
          stance: 'mixed',
          summary: 'Demo summary: Republicans split on the transit grants package.',
          confidence: 'medium',
          evidence_points: ['1 voted Yea, 1 voted Nay'],
          excerpt_ids: [],
        },
      ],
      excerpts: [],
    },
    ranking_reasons: [
      { code: 'cross_party', label: 'Cross-party votes' },
      { code: 'broad_impact', label: 'Broad public impact' },
    ],
    source_coverage: {
      level: 'partial',
      vote_data: true,
      bill_context: true,
      congressional_record: false,
      floor_logs: false,
      model_summary: true,
    },
  },
}
