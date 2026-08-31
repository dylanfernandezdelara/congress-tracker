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

  it('lists the path as chamber chapters with a collapsible committee list', () => {
    render(
      <BillPipeline
        stages={stages}
        statusLabel="In House Administration · waiting for the committee to act"
        journey={[
          {
            id: 'committee-1',
            date: '2026-01-10',
            kind: 'committee',
            label: 'Sent to House Administration',
            chamber: 'House',
            state: 'done',
            tally: null,
            activity_key: 'sent',
            committee_name: 'House Administration Committee',
            system_code: 'hsha00',
            parent_system_code: null,
            is_subcommittee: false,
          },
          {
            id: 'committee-2',
            date: '2026-03-01',
            kind: 'committee',
            label: 'Committee held hearings in House Administration',
            chamber: 'House',
            state: 'done',
            tally: null,
            activity_key: 'hearings',
            committee_name: 'House Administration Committee',
            system_code: 'hsha00',
            parent_system_code: null,
            is_subcommittee: false,
          },
          {
            id: 'floor-received',
            date: '2026-03-23',
            kind: 'received',
            label: 'Received in the Senate',
            chamber: 'Senate',
            state: 'done',
            tally: null,
          },
        ]}
      />,
    )

    expect(screen.getByLabelText('Bill lifecycle')).toBeInTheDocument()
    expect(screen.getByLabelText('Path through Congress')).toBeInTheDocument()
    expect(
      screen.getByText('In House Administration · waiting for the committee to act'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Path through Congress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'House' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Senate' })).toBeInTheDocument()
    expect(screen.getByText('House Administration')).toBeInTheDocument()
    expect(screen.getByText('Referred')).toBeInTheDocument()
    expect(screen.getByText('Hearings')).toBeInTheDocument()
    expect(screen.getByText('Received')).toBeInTheDocument()
    expect(screen.queryByText('Sent to House Administration')).not.toBeInTheDocument()
    const fold = document.querySelector('.bill-pipeline-path-fold')
    expect(fold).toBeInTheDocument()
    expect(fold).toHaveAttribute('open')
  })

  it('keeps each floor vote on its own path row', () => {
    render(
      <BillPipeline
        stages={stages}
        journey={[
          {
            id: 'floor-calendar',
            date: '2026-03-20',
            kind: 'calendar',
            label: 'Placed on the House calendar',
            chamber: 'House',
            state: 'done',
            tally: null,
          },
          {
            id: 'vote-rule',
            date: '2026-04-02',
            kind: 'companion_vote',
            label: 'On Agreeing to the Resolution',
            chamber: 'House',
            state: 'done',
            tally: '218-210',
            question: 'On Agreeing to the Resolution',
          },
          {
            id: 'vote-pass',
            date: '2026-04-02',
            kind: 'passage_vote',
            label: 'On Passage',
            chamber: 'House',
            state: 'done',
            tally: '220-213',
          },
        ]}
      />,
    )

    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('Rule 218–210')).toBeInTheDocument()
    expect(screen.getByText('Passed 220–213')).toBeInTheDocument()
    expect(document.querySelectorAll('.bill-pipeline-path-run')).toHaveLength(3)
    expect(document.querySelector('.bill-pipeline-path-fold')).toBeNull()
  })
})
