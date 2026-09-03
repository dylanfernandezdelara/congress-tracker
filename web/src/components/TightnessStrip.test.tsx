import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeBimodalHouseDots, makeTightnessDot } from '../test/tightnessFixtures'
import { STAGGER_MAX_PX, tightnessPlacements, TightnessStrip } from './TightnessStrip'

function offsetY(item: HTMLElement): number {
  const match = item.style.transform.match(/calc\(-50% \+ (-?[\d.]+)px\)/)
  return match?.[1] ? Number(match[1]) : Number.NaN
}

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
    const offsets = items.map((item) => offsetY(item as HTMLElement))
    expect(offsets[0]).not.toBe(offsets[1])
    expect(offsets.some((value) => value === -5)).toBe(true)
    expect(offsets.some((value) => value === 5)).toBe(true)
    expect(offsets.every((value) => Math.abs(value) <= STAGGER_MAX_PX)).toBe(true)
  })

  it('keeps a production-like knife-edge/steamroll pile inside the track', () => {
    const house = makeBimodalHouseDots()
    const placements = tightnessPlacements(house)
    expect(house.length).toBeGreaterThanOrEqual(18)
    expect(placements.some((placement) => Math.abs(placement.offsetY) > 0)).toBe(true)
    expect(Math.max(...placements.map((placement) => Math.abs(placement.offsetY)))).toBeLessThanOrEqual(
      STAGGER_MAX_PX,
    )
    const keys = new Set(placements.map((placement) => `${placement.leftPct.toFixed(2)}:${placement.offsetY}`))
    expect(keys.size).toBe(house.length)

    const { container } = render(
      <TightnessStrip house={house} senate={[]} selectedKey={null} onSelect={vi.fn()} compact />,
    )
    const items = [
      ...container.querySelectorAll('[data-tightness-row="house"] .tightness-dot-item'),
    ] as HTMLElement[]
    expect(items).toHaveLength(house.length)
    for (const item of items) {
      expect(Math.abs(offsetY(item))).toBeLessThanOrEqual(STAGGER_MAX_PX)
      expect(item.style.getPropertyValue('--tightness-x')).not.toBe('')
    }
    const lefts = items.map((item) => Number(item.style.getPropertyValue('--tightness-x')))
    expect(Math.min(...lefts)).toBeLessThan(5)
    expect(Math.max(...lefts)).toBeGreaterThan(95)
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
