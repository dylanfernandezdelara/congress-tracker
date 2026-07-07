import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { GameRevealResponse } from '../api/types'
import { GameRevealPanel } from './GameRevealPanel'

function makeReveal(correct: 'passed' | 'failed'): GameRevealResponse {
  return {
    id: 'Senate:119:2:7',
    correct,
    vote: {
      chamber: 'Senate',
      question: 'On Passage of the Bill',
      result: correct === 'passed' ? 'Passed' : 'Failed',
      yeas: correct === 'passed' ? 52 : 47,
      nays: correct === 'passed' ? 47 : 52,
      date: '2026-06-05',
    },
    bill: {
      congress: 119,
      type: 'S',
      number: 2,
      title: 'Sample Act',
    },
    policy_area: 'Defense',
    digest: null,
    party_split: null,
  }
}

describe('GameRevealPanel', () => {
  it('styles Passed outcomes with green text', () => {
    render(<GameRevealPanel reveal={makeReveal('passed')} guess="passed" wasCorrect />)

    expect(screen.getByText('Passed')).toHaveClass('text-pass')
  })

  it('styles Failed outcomes with red text', () => {
    render(<GameRevealPanel reveal={makeReveal('failed')} guess="passed" wasCorrect={false} />)

    expect(screen.getByText('Failed')).toHaveClass('text-fail')
  })
})
