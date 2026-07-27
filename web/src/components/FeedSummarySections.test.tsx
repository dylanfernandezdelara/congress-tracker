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

  it('renders a short CRS lead when there is no digest and puts the full CRS in disclosure', () => {
    const crs =
      'This concurrent resolution establishes the congressional budget for the federal government for FY2027, sets forth budgetary levels for FY2028-FY2036, and provides reconciliation instructions for legislation that increases the deficit. The resolution recommends levels and amounts for many accounts across the federal government.'
    render(<FeedSummarySections content={content({ crsSummary: crs })} />)

    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    const lead = document.querySelector('.feed-row-detail-section .feed-row-summary-body')
    expect(lead).toHaveTextContent(/This concurrent resolution establishes/)
    expect(lead?.textContent?.endsWith('…')).toBe(true)
    expect(lead?.textContent?.length).toBeLessThan(crs.length)
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
