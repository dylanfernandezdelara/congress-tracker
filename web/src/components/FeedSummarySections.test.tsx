import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FeedSummaryContent } from '../utils/feedRowLabels'
import { FeedSummarySections } from './FeedSummarySections'

function content(overrides: Partial<FeedSummaryContent> = {}): FeedSummaryContent {
  return {
    whatItDoes: null,
    keyPoints: [],
    crsSummary: null,
    pending: false,
    ...overrides,
  }
}

describe('FeedSummarySections', () => {
  it('renders pending copy when no summary sources exist', () => {
    render(<FeedSummarySections content={content({ pending: true })} />)

    expect(screen.getByText('Plain-English summary coming soon.')).toBeInTheDocument()
  })

  it('renders what it does and key points with CRS in a disclosure', () => {
    render(
      <FeedSummarySections
        content={content({
          whatItDoes: 'It does something important in plain language.',
          keyPoints: ['Point one'],
          crsSummary: 'Official CRS summary text.',
        })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(
      screen.getByText('It does something important in plain language.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Key points' })).toBeInTheDocument()
    expect(screen.getByText('Point one')).toBeInTheDocument()
    expect(screen.getByText('Official CRS summary')).toBeInTheDocument()
    expect(screen.getAllByText('Official CRS summary text.')).toHaveLength(1)
  })

  it('renders a short complete CRS sentence and puts the full CRS in disclosure', () => {
    const crs =
      'This concurrent resolution directs the President to remove U.S. Armed Forces from hostilities against Iran or any part of its government or military unless a declaration of war or specific statutory authorization has been enacted. Congress retains the power to authorize force.'
    render(<FeedSummarySections content={content({ crsSummary: crs })} />)

    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    const body = document.querySelector('.feed-row-detail-section .feed-row-summary-body')
    expect(body).toHaveTextContent(
      'This concurrent resolution directs the President to remove U.S. Armed Forces from hostilities against Iran or any part of its government or military unless a declaration of war or specific statutory authorization has been enacted.',
    )
    expect(body?.textContent?.endsWith('…')).toBe(false)
    expect(body?.textContent?.length).toBeLessThan(crs.length)
    expect(screen.getByText('Official CRS summary')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Official CRS summary' })).toHaveTextContent(crs)
  })

  it('keeps a short CRS as the primary summary without a redundant disclosure', () => {
    const crs = 'This bill funds rural hospitals.'
    render(<FeedSummarySections content={content({ crsSummary: crs })} />)

    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByText(crs)).toBeInTheDocument()
    expect(screen.queryByText('Official CRS summary')).toBeNull()
  })

  it('shows CRS only in the disclosure when key points exist without a lead', () => {
    render(
      <FeedSummarySections
        content={content({
          keyPoints: ['Point one'],
          crsSummary: 'Official CRS summary text.',
        })}
      />,
    )

    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()
    expect(screen.getByText('Official CRS summary')).toBeInTheDocument()
    expect(screen.getAllByText('Official CRS summary text.')).toHaveLength(1)
  })
})
