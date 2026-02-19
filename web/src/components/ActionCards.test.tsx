import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActionCardVM } from '../ui/homeViewModel'
import ActionCards from './ActionCards'

function makeCard(overrides: Partial<ActionCardVM> = {}): ActionCardVM {
  return {
    id: 'test-bill',
    category: 'Economics and Public Finance',
    billCode: 'H.R. 7147',
    title: 'Federal Spending and Appropriations',
    outcome: 'The Senate blocked progress, so leadership would need to bring it back for another attempt.',
    context: '$886 billion for the Department of Defense.',
    status: 'rejected',
    voteLine: { label: 'Cloture failed', yea: 52, nay: 45, date: '2026-02-12', leadParty: { abbr: 'R', color: '#dc2626' } },
    ...overrides,
  }
}

describe('ActionCards', () => {
  it('renders the correct number of cards', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' }), makeCard({ id: 'c' })]
    const { container } = render(<ActionCards cards={cards} />)
    expect(container.querySelectorAll('.actionCard')).toHaveLength(3)
  })

  it('renders all 5 visual elements per card', () => {
    const { container } = render(<ActionCards cards={[makeCard()]} />)
    expect(container.querySelector('.actionCard__tagRow')).toBeTruthy()
    expect(container.querySelector('.actionCard__title')).toBeTruthy()
    expect(container.querySelector('.actionCard__outcome')).toBeTruthy()
    expect(container.querySelector('.actionCard__context')).toBeTruthy()
    expect(container.querySelector('.actionCard__vote')).toBeTruthy()
  })

  it('renders the lead party indicator', () => {
    const { container } = render(<ActionCards cards={[makeCard()]} />)
    const dot = container.querySelector('.actionCard__partyDot')
    expect(dot).toBeTruthy()
    expect(screen.getByText(/Republican-led/)).toBeTruthy()
  })

  it('displays the correct status badge text', () => {
    const { rerender } = render(<ActionCards cards={[makeCard({ status: 'passed' })]} />)
    expect(screen.getByText('Passed')).toBeTruthy()

    rerender(<ActionCards cards={[makeCard({ status: 'rejected' })]} />)
    expect(screen.getByText('Rejected')).toBeTruthy()

    rerender(<ActionCards cards={[makeCard({ status: 'in-progress' })]} />)
    expect(screen.getByText('In progress')).toBeTruthy()
  })
})
