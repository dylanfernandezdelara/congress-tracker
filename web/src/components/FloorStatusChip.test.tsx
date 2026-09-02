import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ChamberFloorDetail } from '../utils/feedQuiet'
import { resetSheetLayerForTests } from '../utils/sheetLayer'
import { FloorStatusChip } from './FloorStatusChip'

function detail(
  chamber: 'House' | 'Senate',
  overrides: Partial<ChamberFloorDetail> = {},
): ChamberFloorDetail {
  const source =
    chamber === 'House'
      ? {
          sourceName: '2026 House Calendar',
          sourceUrl: 'https://pressgallery.house.gov/schedules/2026-house-calendar',
        }
      : {
          sourceName: 'Senate 2026 legislative schedule',
          sourceUrl: 'https://www.senate.gov/legislative/2026_schedule.htm',
        }
  return {
    chamber,
    status: 'in_recess',
    statusLabel: 'In recess',
    lastActivityDay: chamber === 'House' ? '2026-07-23' : '2026-08-08',
    returnsOn: chamber === 'House' ? '2026-08-31' : '2026-09-14',
    periodLabel: chamber === 'House' ? 'District work period' : 'State work period',
    ...source,
    ...overrides,
  }
}

afterEach(() => {
  resetSheetLayerForTests()
  document.body.style.overflow = ''
})

describe('FloorStatusChip', () => {
  it('shows which chamber the status belongs to', () => {
    render(
      <FloorStatusChip
        house={detail('House', { status: 'working', statusLabel: 'Working', returnsOn: null, periodLabel: null })}
        senate={detail('Senate')}
      />,
    )

    expect(screen.getByRole('button', { name: /House working · Senate in recess/ })).toHaveTextContent(
      'House working · Senate in recess',
    )
  })

  it('opens a concise sheet with per-chamber facts, not a long lead', () => {
    render(
      <FloorStatusChip house={detail('House')} senate={detail('Senate')} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /House & Senate in recess/ }))

    const dialog = screen.getByRole('dialog', { name: 'Floor status' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).queryByText(/do not return together/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/set separate floor calendars/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('House & Senate in recess')).not.toBeInTheDocument()

    const house = within(dialog).getByRole('region', { name: 'House' })
    expect(within(house).getByText('In recess')).toBeInTheDocument()
    expect(within(house).getByText('Back Monday, Aug 31')).toBeInTheDocument()
    expect(within(house).getByText('Last activity Jul 23 · District work period')).toBeInTheDocument()

    const senate = within(dialog).getByRole('region', { name: 'Senate' })
    expect(within(senate).getByText('In recess')).toBeInTheDocument()
    expect(within(senate).getByText('Back Monday, Sep 14')).toBeInTheDocument()
    expect(within(senate).getByText('Last activity Aug 8 · State work period')).toBeInTheDocument()
  })

  it('renders nothing without a status label', () => {
    const { container } = render(
      <FloorStatusChip
        house={detail('House', { status: null, statusLabel: null })}
        senate={detail('Senate', { status: null, statusLabel: null })}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
