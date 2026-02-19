import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { InsightCardVM } from '../ui/homeViewModel'
import InsightFeed from './InsightFeed'

function makeInsightCard(overrides: Partial<InsightCardVM> = {}): InsightCardVM {
  return {
    id: 'test-bill',
    category: 'Economics and Public Finance',
    billCode: 'H.R. 7147',
    title: 'Federal Spending and Appropriations',
    status: 'rejected',
    statusLabel: 'Rejected',
    outcome: 'The Senate blocked progress.',
    context: '$886 billion for the Department of Defense.',
    stepType: 'cloture',
    voteTally: { yea: 52, nay: 45, label: 'Cloture failed', date: '2026-02-12' },
    partyPositions: [
      {
        party: 'D',
        partyLabel: 'Democrats',
        color: '#2563eb',
        stance: 'oppose',
        stanceLabel: 'Opposed',
        evidencePoints: ['45 voted Nay, 2 voted Yea'],
        inferredRationale: [],
        confidence: 'high',
      },
      {
        party: 'R',
        partyLabel: 'Republicans',
        color: '#dc2626',
        stance: 'support',
        stanceLabel: 'Supported',
        evidencePoints: ['50 voted Yea, 0 voted Nay'],
        inferredRationale: ['Aligns with defense funding priorities'],
        confidence: 'medium',
      },
    ],
    beneficiaries: [
      { group: 'Department of Defense', effect: 'benefit', effectLabel: 'Benefits' },
    ],
    analysisQuality: {
      evidence_coverage: 'partial',
      inference_used: true,
      confidence_reason: 'Partial official evidence available; some analysis is inferred.',
    },
    hasInference: true,
    isCloseVote: false,
    crossoverSenators: [],
    ...overrides,
  }
}

describe('InsightFeed', () => {
  it('renders the correct number of cards', () => {
    const cards = [makeInsightCard({ id: 'a' }), makeInsightCard({ id: 'b' })]
    const { container } = render(<InsightFeed cards={cards} />)
    expect(container.querySelectorAll('.insightCard')).toHaveLength(2)
  })

  it('renders party positions with stance labels', () => {
    render(<InsightFeed cards={[makeInsightCard()]} />)
    expect(screen.getByText('Democrats')).toBeTruthy()
    expect(screen.getByText('Republicans')).toBeTruthy()
    expect(screen.getByText('Opposed')).toBeTruthy()
    expect(screen.getByText('Supported')).toBeTruthy()
  })

  it('shows evidence and inference labels separately', () => {
    render(<InsightFeed cards={[makeInsightCard()]} />)
    const evidenceTags = screen.getAllByText('Evidence')
    expect(evidenceTags.length).toBeGreaterThan(0)
    const inferenceTags = screen.getAllByText('Inference')
    expect(inferenceTags.length).toBeGreaterThan(0)
  })

  it('renders inference tags for all inferred rationale lines', () => {
    const card = makeInsightCard({
      partyPositions: [
        {
          party: 'R',
          partyLabel: 'Republicans',
          color: '#dc2626',
          stance: 'support',
          stanceLabel: 'Supported',
          evidencePoints: [],
          inferredRationale: ['Reason A', 'Reason B'],
          confidence: 'low',
        },
      ],
      hasInference: true,
    })
    render(<InsightFeed cards={[card]} />)
    const tags = screen.getAllByText('Inference')
    expect(tags.length).toBeGreaterThanOrEqual(2)
  })

  it('renders beneficiary panel', () => {
    render(<InsightFeed cards={[makeInsightCard()]} />)
    expect(screen.getByText('Who is affected')).toBeTruthy()
    expect(screen.getByText('Department of Defense')).toBeTruthy()
    expect(screen.getByText('Benefits')).toBeTruthy()
  })

  it('renders confidence badges', () => {
    render(<InsightFeed cards={[makeInsightCard()]} />)
    expect(screen.getByText('High confidence')).toBeTruthy()
    expect(screen.getByText('Moderate confidence')).toBeTruthy()
  })

  it('shows analysis quality note in footer', () => {
    render(<InsightFeed cards={[makeInsightCard()]} />)
    expect(screen.getByText(/some analysis is inferred/i)).toBeTruthy()
  })

  it('renders vote-only fallback note when no analysis quality', () => {
    const card = makeInsightCard({
      analysisQuality: null,
      hasInference: false,
    })
    render(<InsightFeed cards={[card]} />)
    expect(screen.getByText(/voting record only/i)).toBeTruthy()
  })

  it('renders crossover section for close votes', () => {
    const card = makeInsightCard({
      isCloseVote: true,
      crossoverSenators: [
        { name: 'Collins', party: 'R', state: 'ME', color: '#dc2626', voteCast: 'Yea', swingPct: 40 },
      ],
    })
    render(<InsightFeed cards={[card]} />)
    expect(screen.getByText('Crossover votes')).toBeTruthy()
    expect(screen.getByText('Collins')).toBeTruthy()
    expect(screen.getByText('voted Yea')).toBeTruthy()
  })

  it('does not render crossover section for non-close votes', () => {
    const card = makeInsightCard({ isCloseVote: false, crossoverSenators: [] })
    const { container } = render(<InsightFeed cards={[card]} />)
    expect(container.querySelector('.insightCard__dissent')).toBeNull()
  })

  it('returns null for empty cards array', () => {
    const { container } = render(<InsightFeed cards={[]} />)
    expect(container.querySelector('.insightFeed')).toBeNull()
  })

  it('shows the status badge text', () => {
    render(<InsightFeed cards={[makeInsightCard({ status: 'passed', statusLabel: 'Passed' })]} />)
    expect(screen.getByText('Passed')).toBeTruthy()
  })
})
