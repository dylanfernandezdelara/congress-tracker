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
  it('opens a sheet with per-chamber return dates', () => {
    render(<FloorStatusChip label="In recess" house={detail('House')} senate={detail('Senate')} />)

    fireEvent.click(screen.getByRole('button', { name: /In recess/ }))

    const dialog = screen.getByRole('dialog', { name: 'Floor status' })
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'House and Senate are both in recess, but they do not return together. The House is scheduled back Monday, Aug 31. The Senate is scheduled back Monday, Sep 14.',
      ),
    ).toBeInTheDocument()

    const house = within(dialog).getByRole('region', { name: 'House' })
    expect(within(house).getByText('Back Monday, Aug 31')).toBeInTheDocument()
    expect(within(house).getByText('Last floor activity Jul 23')).toBeInTheDocument()

    const senate = within(dialog).getByRole('region', { name: 'Senate' })
    expect(within(senate).getByText('Back Monday, Sep 14')).toBeInTheDocument()
    expect(within(senate).getByText('Last floor activity Aug 8')).toBeInTheDocument()
  })

  it('renders nothing without a status label', () => {
    const { container } = render(
      <FloorStatusChip label={null} house={detail('House')} senate={detail('Senate')} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
