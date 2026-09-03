import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeTightnessDot } from '../test/tightnessFixtures'
import { TightnessStrip } from './TightnessStrip'

function barWidth(button: HTMLElement): number {
  return Number(button.style.getPropertyValue('--tightness-bar'))
}

describe('TightnessStrip', () => {
  it('renders closest-vote bars as whole-row tap targets', () => {
    const onSelect = vi.fn()
    const house = [makeTightnessDot()]
    const senate = [
      makeTightnessDot({
        kind: 'nominee',
        chamber: 'Senate',
        roll_number: 9101,
        yeas: 51,
        nays: 49,
        yea_pct: 51 / 100,
        bill_type: null,
        bill_number: null,
        nominee_name: 'Jane Doe',
      }),
    ]
    const { container } = render(
      <TightnessStrip
        house={house}
        senate={senate}
        selectedKey={null}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByRole('region', { name: 'Vote tightness' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Closest votes' })).toBeInTheDocument()
    expect(screen.queryByText(/50% yea/)).not.toBeInTheDocument()
    expect(container.querySelector('.tightness-scale-label')).toBeNull()
    expect(container.querySelector('[data-tightness-row="house"]')).not.toBeNull()
    expect(container.querySelector('[data-tightness-row="senate"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Senate bills & nominees' })).toBeInTheDocument()
    expect(screen.getByText('H.R. 88 · 210–208')).toBeInTheDocument()
    expect(screen.getByText('PN · Jane Doe · 51–49')).toBeInTheDocument()

    const houseRow = screen.getByRole('button', { name: /House bill H\.R\. 88, 210–208, party-line/ })
    expect(houseRow.style.transform).toBe('')
    expect(houseRow.style.getPropertyValue('--tightness-x')).toBe('')
    fireEvent.click(houseRow)
    expect(onSelect).toHaveBeenCalledWith(house[0])
  })

  it('encodes bar width as vote gap with no x-shift or stagger', () => {
    const house = [
      makeTightnessDot(),
      makeTightnessDot({
        roll_number: 9005,
        bill_number: 1,
        yeas: 218,
        nays: 201,
        yea_pct: 218 / 419,
        cohesion: 'bipartisan',
        vote_date: '2026-07-21',
      }),
      makeTightnessDot({
        roll_number: 9013,
        bill_number: 99,
        yeas: 212,
        nays: 206,
        result: 'Failed',
        yea_pct: 212 / 418,
        vote_date: '2026-07-20',
      }),
      makeTightnessDot({
        roll_number: 9012,
        bill_number: 33,
        yeas: 421,
        nays: 1,
        yea_pct: 421 / 422,
        cohesion: 'bipartisan',
        vote_date: '2026-07-21',
      }),
    ]
    const { container } = render(
      <TightnessStrip house={house} senate={[]} selectedKey={null} onSelect={vi.fn()} />,
    )

    const buttons = [
      ...container.querySelectorAll('[data-tightness-row="house"] .tightness-bar-row'),
    ] as HTMLElement[]
    expect(buttons).toHaveLength(3)
    expect(screen.getByText('H.R. 88 · 210–208')).toBeInTheDocument()
    expect(screen.getByText('H.R. 99 · 212–206 failed')).toBeInTheDocument()
    expect(screen.getByText('H.R. 1 · 218–201')).toBeInTheDocument()
    expect(screen.queryByText(/421–1/)).not.toBeInTheDocument()

    const widths = buttons.map((button) => barWidth(button))
    expect(widths[0]).toBeLessThan(widths[1]!)
    expect(widths[1]).toBeLessThan(widths[2]!)
    expect(widths).toEqual([2 / 20, 6 / 20, 17 / 20])
    for (const button of buttons) {
      expect(button.style.transform).toBe('')
      expect(button.style.getPropertyValue('--tightness-x')).toBe('')
    }
  })

  it('keeps rendered rows at or under 4 House and 3 Senate', () => {
    const house = Array.from({ length: 8 }, (_, index) =>
      makeTightnessDot({
        roll_number: 8100 + index,
        bill_number: 200 + index,
        yeas: 210 + index,
        nays: 208,
      }),
    )
    const senate = Array.from({ length: 6 }, (_, index) =>
      makeTightnessDot({
        kind: 'nominee',
        chamber: 'Senate',
        roll_number: 9100 + index,
        yeas: 51 + index,
        nays: 49,
        bill_type: null,
        bill_number: null,
        nominee_name: `Nominee ${index}`,
      }),
    )
    const { container } = render(
      <TightnessStrip house={house} senate={senate} selectedKey={null} onSelect={vi.fn()} />,
    )
    expect(container.querySelectorAll('[data-tightness-row="house"] .tightness-bar-row')).toHaveLength(4)
    expect(container.querySelectorAll('[data-tightness-row="senate"] .tightness-bar-row')).toHaveLength(3)
    expect(screen.getByText('PN · Nominee 0 · 51–49')).toBeInTheDocument()
    expect(screen.queryByText(/H\.R\. \d+ · 51–49/)).not.toBeInTheDocument()
  })

  it('hides empty closest-vote rows when a load error is set', () => {
    const onRetry = vi.fn()
    const { container } = render(
      <TightnessStrip
        house={[]}
        senate={[]}
        selectedKey={null}
        onSelect={vi.fn()}
        error="Couldn't load vote tightness."
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText("Couldn't load vote tightness.")).toBeInTheDocument()
    expect(container.querySelector('[data-tightness-row="house"]')).toBeNull()
    expect(container.querySelector('[data-tightness-row="senate"]')).toBeNull()
    expect(screen.queryByText('No close House passage votes.')).not.toBeInTheDocument()
    expect(screen.queryByText('No close Senate votes.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('marks the selected row without stacking z-index tricks', () => {
    const house = [makeTightnessDot(), makeTightnessDot({ roll_number: 9005, bill_number: 1, yeas: 218, nays: 210 })]
    const { container } = render(
      <TightnessStrip
        house={house}
        senate={[]}
        selectedKey="bill:House:119:2:9010"
        onSelect={vi.fn()}
      />,
    )
    const selected = container.querySelector('.tightness-bar-row.is-selected')
    expect(selected).not.toBeNull()
    expect(selected?.getAttribute('aria-pressed')).toBe('true')
  })
})
