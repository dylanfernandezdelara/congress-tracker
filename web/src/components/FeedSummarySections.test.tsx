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
    keyPointSections: [],
    whoItAffects: [],
    inside: [],
    provisional: false,
    ...overrides,
  }
}

describe('FeedSummarySections', () => {
  it('shows who the bill affects, links each key point to its section, and sizes the parts of a long bill', () => {
    render(
      <FeedSummarySections
        textUrl="https://www.congress.gov/bill/119th-congress/house-bill/1/text"
        content={content({
          whatItDoes: 'Extends tax cuts and changes Medicaid.',
          keyPoints: ['Extends lower tax rates', 'Adds Medicaid work rules'],
          keyPointSections: ['Sec. 70101', null],
          whoItAffects: ['taxpayers', 'Medicaid enrollees'],
          inside: [
            { part: 'Taxes', summary: 'Extends the 2017 tax cuts', section: 'Title VII', share: 42 },
            { part: 'Border', summary: 'Funds detention', section: 'Title IX', share: 9 },
          ],
        })}
      />,
    )

    expect(screen.getByRole('list', { name: 'Who it affects' })).toHaveTextContent('taxpayersMedicaid enrollees')
    const ref = screen.getByRole('link', { name: 'Sec. 70101, full bill text on Congress.gov (opens in a new tab)' })
    expect(ref).toHaveAttribute('href', 'https://www.congress.gov/bill/119th-congress/house-bill/1/text')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'What’s inside' })).toBeInTheDocument()
    expect(screen.getByText('42% of the bill')).toBeInTheDocument()
    const bars = document.querySelectorAll<HTMLElement>('.feed-row-inside-bar > span')
    expect(bars).toHaveLength(2)
    expect(bars[0]!.style.getPropertyValue('--share')).toBe('42%')
    expect(screen.queryByText(/Early summary/)).toBeNull()
  })

  it('shows no bars unless every part has a measured share', () => {
    render(
      <FeedSummarySections
        content={content({
          whatItDoes: 'Does two things.',
          inside: [
            { part: 'Taxes', summary: 'Extends cuts', section: 'Title VII', share: null },
            { part: 'Food', summary: 'Changes SNAP', section: 'Title I', share: 9 },
          ],
        })}
      />,
    )

    expect(screen.getByText('Changes SNAP')).toBeInTheDocument()
    expect(document.querySelectorAll('.feed-row-inside-bar')).toHaveLength(0)
    expect(screen.queryByText(/of the bill/)).toBeNull()
  })

  it('shows a section as plain text without a text URL, and adds nothing for an older summary', () => {
    render(
      <FeedSummarySections
        content={content({ whatItDoes: 'Older summary.', keyPoints: ['A point', 'B point'], keyPointSections: ['Sec. 2', null] })}
      />,
    )

    expect(screen.getByText('Sec. 2')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    for (const name of ['Who it affects', 'What’s inside']) expect(screen.queryByRole('heading', { name })).toBeNull()
    expect(screen.queryByText(/Early summary/)).toBeNull()
  })

  it('marks a summary written from the title alone as provisional', () => {
    render(<FeedSummarySections content={content({ whatItDoes: 'Names a post office.', provisional: true })} />)

    expect(screen.getByText('Early summary from the bill’s title. It updates when the full text is published.')).toBeInTheDocument()
  })

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
