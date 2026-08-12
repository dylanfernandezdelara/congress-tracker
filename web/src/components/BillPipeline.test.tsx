import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { BillLifecycleStage } from '../utils/billLifecycleStages'
import { BillPipeline } from './BillPipeline'

const stages: BillLifecycleStage[] = [
  { key: 'introduced', label: 'Introduced', date: '2025-12-11', state: 'done' },
  { key: 'house', label: 'Passed House', date: '2026-05-14', state: 'done' },
  { key: 'senate', label: 'Passed Senate', date: '2026-06-24', state: 'done' },
  { key: 'to_president', label: 'To President', date: '2026-06-29', state: 'done' },
  {
    key: 'outcome',
    label: 'Became law — unsigned',
    date: '2026-07-11',
    state: 'done',
    detail: "Enacted without the President's signature (10-day rule)",
  },
]

describe('BillPipeline', () => {
  it('renders stage labels, dates, and states', () => {
    const { container } = render(
      <BillPipeline stages={stages} detail={stages[4]?.detail ?? null} />,
    )

    expect(screen.getByLabelText('Bill lifecycle')).toBeInTheDocument()
    expect(screen.getByText('Introduced')).toBeInTheDocument()
    expect(screen.getByText('Passed House')).toBeInTheDocument()
    expect(screen.getByText('Passed Senate')).toBeInTheDocument()
    expect(screen.getByText('To President')).toBeInTheDocument()
    expect(screen.getByText('Became law — unsigned')).toBeInTheDocument()

    expect(container.querySelectorAll('.bill-pipeline-step--done')).toHaveLength(5)
    expect(screen.getByText('Dec 11')).toBeInTheDocument()
    expect(screen.getByText('Jul 11')).toBeInTheDocument()
    expect(
      screen.getByText("Enacted without the President's signature (10-day rule)"),
    ).toBeInTheDocument()
  })

  it('emphasizes the current stage and shows pending markers', () => {
    const pendingStages: BillLifecycleStage[] = [
      { key: 'introduced', label: 'Introduced', date: '2025-12-11', state: 'done' },
      { key: 'house', label: 'Passed House', date: '2026-05-14', state: 'done' },
      { key: 'senate', label: 'Passed Senate', date: null, state: 'current' },
      { key: 'to_president', label: 'To President', date: null, state: 'pending' },
      { key: 'outcome', label: 'Law or veto', date: null, state: 'pending' },
    ]

    const { container } = render(<BillPipeline stages={pendingStages} />)

    expect(container.querySelector('.bill-pipeline-step--current')).toBeTruthy()
    expect(container.querySelectorAll('.bill-pipeline-step--pending')).toHaveLength(2)
    expect(container.querySelectorAll('.bill-pipeline-date')).toHaveLength(2)
    expect(screen.getByText('Passed Senate')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('marks failed outcome stages', () => {
    const vetoStages: BillLifecycleStage[] = [
      { key: 'introduced', label: 'Introduced', date: '2025-01-01', state: 'done' },
      { key: 'house', label: 'Passed House', date: '2026-02-01', state: 'done' },
      { key: 'senate', label: 'Passed Senate', date: '2026-02-10', state: 'done' },
      { key: 'to_president', label: 'To President', date: '2026-02-15', state: 'done' },
      { key: 'outcome', label: 'Vetoed', date: '2026-02-20', state: 'failed' },
    ]

    const { container } = render(<BillPipeline stages={vetoStages} />)
    expect(container.querySelector('.bill-pipeline-step--failed')).toBeTruthy()
    expect(screen.getByText('Vetoed')).toBeInTheDocument()
  })

  it('lists committee steps under the existing diagram', () => {
    render(
      <BillPipeline
        stages={stages}
        process={{
          current_status: 'in_committee',
          current_label: 'In House Administration · waiting for the committee to act',
          stages: [
            {
              date: '2026-01-10',
              label: 'Sent to House Administration',
              activity_key: 'sent',
              chamber: 'House',
              committee_name: 'House Administration',
              system_code: 'hsad00',
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: null,
            },
            {
              date: '2026-03-01',
              label: 'Committee held hearings in House Administration',
              activity_key: 'hearings',
              chamber: 'House',
              committee_name: 'House Administration',
              system_code: 'hsad00',
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: null,
            },
          ],
        }}
      />,
    )

    expect(screen.getByLabelText('Bill lifecycle')).toBeInTheDocument()
    expect(screen.queryByText('Committee')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Committee steps')).toBeInTheDocument()
    expect(
      screen.getByText('In House Administration · waiting for the committee to act'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sent to House Administration')).toBeInTheDocument()
    expect(
      screen.getByText('Committee held hearings in House Administration'),
    ).toBeInTheDocument()
  })
})
