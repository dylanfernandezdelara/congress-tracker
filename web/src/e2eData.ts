import type {
  ActivityIndexResponse,
  BriefingFeedResponse,
  VoteContentProfile,
  VoteDetailResponse,
} from './api'

const E2E_GENERATED_AT = '2026-01-19T18:00:00Z'
const E2E_CONGRESS = 119
const E2E_SESSION = 2

function e2eVoteContentProfile(
  base: Pick<VoteContentProfile, 'vote_id' | 'vote_number' | 'vote_date' | 'plain_action' | 'public_impact_summary'>
): VoteContentProfile {
  return {
    congress: E2E_CONGRESS,
    session: E2E_SESSION,
    target_type: 'bill',
    stage: 'final_passage',
    official_summary: null,
    policy_topics: [],
    affected_groups: [],
    content_confidence: 'medium',
    source_basis: ['vote_question'],
    ...base,
  }
}

const WINDOW = {
  start_date: '2025-12-20',
  end_date: '2026-01-19',
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

export const E2E_BRIEFING: BriefingFeedResponse = {
  generated_at: E2E_GENERATED_AT,
  source: 'd1',
  coverage_note: 'Demo briefing built from fixture bill and vote context.',
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
      source_coverage: {
        level: 'partial',
        vote_data: true,
        bill_context: true,
        congressional_record: false,
        floor_logs: false,
        model_summary: true,
        note: 'Demo vote uses bill analysis and tally-derived party summaries.',
      },
      detail_path: '/votes/119/2/14',
      plain_action: 'The Senate passed Border Infrastructure Modernization Act.',
      public_impact_summary:
        'Funds major improvements at border entry points to handle travel and trade more effectively.',
      content_confidence: 'high',
      source_basis: ['official_bill_summary', 'vote_question'],
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
      source_coverage: {
        level: 'partial',
        vote_data: true,
        bill_context: true,
        congressional_record: false,
        floor_logs: false,
        model_summary: true,
      },
      detail_path: '/votes/119/2/12',
      plain_action: 'The Senate passed Clean Transit Access Act.',
      public_impact_summary:
        'Creates grants to help transit agencies replace older fleets with zero-emission vehicles.',
      content_confidence: 'high',
      source_basis: ['official_bill_summary', 'vote_question'],
    },
  ],
}

export const E2E_VOTE_DETAILS: Record<string, VoteDetailResponse> = {
  '119:2:14': {
    generated_at: E2E_GENERATED_AT,
    source: 'd1',
    vote_content_profile: e2eVoteContentProfile({
      vote_id: '119:2:14',
      vote_number: 14,
      vote_date: '2026-01-17',
      plain_action: 'The Senate passed the Border Infrastructure bill (demo).',
      public_impact_summary: 'Demo: border infrastructure modernization.',
    }),
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
    source_coverage: {
      level: 'partial',
      vote_data: true,
      bill_context: true,
      congressional_record: false,
      floor_logs: false,
      model_summary: true,
      note: 'Demo vote uses bill analysis and tally-derived party summaries.',
    },
  },
  '119:2:12': {
    generated_at: E2E_GENERATED_AT,
    source: 'd1',
    vote_content_profile: e2eVoteContentProfile({
      vote_id: '119:2:12',
      vote_number: 12,
      vote_date: '2026-01-15',
      plain_action: 'The Senate passed the Clean Transit bill (demo).',
      public_impact_summary: 'Demo: clean transit fleet modernization.',
    }),
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
