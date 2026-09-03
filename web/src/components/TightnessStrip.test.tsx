import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeTightnessDot } from '../test/tightnessFixtures'
import { TightnessStrip } from './TightnessStrip'

describe('TightnessStrip', () => {
  it('always renders House and Senate rows as tap targets', () => {
    const onSelect = vi.fn()
    const house = [makeTightnessDot()]
    const senate = [
      makeTightnessDot({
        kind: 'nominee',
        chamber: 'Senate',
        roll_number: 9101,
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
        compact
      />,
    )

    expect(screen.getByRole('region', { name: 'Vote tightness' })).toBeInTheDocument()
    expect(container.querySelector('[data-tightness-row="house"]')).not.toBeNull()
    expect(container.querySelector('[data-tightness-row="senate"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Senate bills & nominees' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /House bill H\.R\. 88/ }))
    expect(onSelect).toHaveBeenCalledWith(house[0])
  })

  it('staggers nearby knife-edge dots so both stay tappable', () => {
    const onSelect = vi.fn()
    const house = [
      makeTightnessDot(),
      makeTightnessDot({
        roll_number: 9005,
        bill_number: 1,
        yeas: 218,
        nays: 210,
        yea_pct: 218 / 428,
        cohesion: 'bipartisan',
        headline: 'House passes a broad energy permitting and production package (local sample)',
      }),
    ]
    const { container } = render(
      <TightnessStrip house={house} senate={[]} selectedKey={null} onSelect={onSelect} compact />,
    )

    const items = [...container.querySelectorAll('[data-tightness-row="house"] .tightness-dot-item')]
    expect(items).toHaveLength(2)
    const transforms = items.map((item) => (item as HTMLElement).style.transform)
    expect(transforms[0]).not.toBe(transforms[1])
    expect(transforms.some((value) => value.includes('-5px'))).toBe(true)
    expect(transforms.some((value) => value.includes('5px'))).toBe(true)
  })

  it('keeps the selected knife-edge dot above its cluster', () => {
    const house = [
      makeTightnessDot(),
      makeTightnessDot({
        roll_number: 9005,
        bill_number: 1,
        yeas: 218,
        nays: 210,
        yea_pct: 218 / 428,
        cohesion: 'bipartisan',
      }),
    ]
    const selectedKey = 'bill:House:119:2:9010'
    const { container } = render(
      <TightnessStrip house={house} senate={[]} selectedKey={selectedKey} onSelect={vi.fn()} />,
    )
    const items = [...container.querySelectorAll('[data-tightness-row="house"] .tightness-dot-item')] as HTMLElement[]
    const selected = items.find((item) => item.querySelector('.is-selected'))
    const other = items.find((item) => !item.querySelector('.is-selected'))
    expect(Number(selected?.style.zIndex)).toBeGreaterThan(Number(other?.style.zIndex))
  })
})
