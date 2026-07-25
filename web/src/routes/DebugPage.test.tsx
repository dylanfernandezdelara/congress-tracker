import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { IngestMonitorPayload } from '@congress-tracker/shared/ingest-api-types'
import type { IngestMonitorResponse } from '../api/client'
import { AppLayout } from '../layouts/AppLayout'
import DebugPage from './DebugPage'

const { fetchIngestMonitor } = vi.hoisted(() => ({
  fetchIngestMonitor: vi.fn(),
}))

vi.mock('../api/client', () => ({
  fetchIngestMonitor,
}))

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function baseIngest(overrides: Partial<IngestMonitorPayload> = {}): IngestMonitorPayload {
  return {
    status: 'stale',
    message: 'No successful scheduled ingest within the freshness window.',
    daily_cron_utc: '10:00',
    stale_after_hours: 30,
    latest_passage_vote_date: '2026-07-20',
    missing_digest_count: 0,
    last_success: null,
    last_failure: null,
    last_scheduled_success: null,
    last_skipped: null,
    admin_feed_ingest: 'POST /__pipeline/run/feed',
    ...overrides,
  }
}

function mockMonitor(ingest: IngestMonitorPayload) {
  const response: IngestMonitorResponse = {
    as_of: '2026-07-25T12:00:00.000Z',
    ingest,
    alerting: {
      cloudflare_logs: 'Workers Observability',
      external_monitor: 'Poll /health',
    },
  }
  fetchIngestMonitor.mockResolvedValue(response)
}

function renderDebugPage() {
  return render(
    <MemoryRouter initialEntries={['/debug']} future={routerFuture}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/debug" element={<DebugPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('DebugPage', () => {
  it('renders a busy-skip record with plain-English reason', async () => {
    mockMonitor(
      baseIngest({
        last_skipped: {
          skipped_at: '2026-07-25T10:00:00.000Z',
          trigger: 'scheduled',
          reason: 'pipeline_busy',
        },
      }),
    )

    renderDebugPage()

    expect(await screen.findByRole('heading', { name: 'Last skipped' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Skipped because another pipeline held the write lease, so no new data was ingested on that invocation.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('scheduled')).toBeInTheDocument()
  })

  it('renders calm empty states when skip, success, and failure are null', async () => {
    mockMonitor(baseIngest())

    renderDebugPage()

    expect(await screen.findByText('No recorded skips.')).toBeInTheDocument()
    expect(screen.getByText('No success recorded yet.')).toBeInTheDocument()
    expect(screen.getByText('No recorded failures.')).toBeInTheDocument()
    // Nothing has run at all, so a separate scheduled block would repeat the point.
    expect(screen.queryByRole('heading', { name: 'Last scheduled success' })).not.toBeInTheDocument()
  })

  it('states outright that the cron has never succeeded when only an admin run has', async () => {
    mockMonitor(
      baseIngest({
        last_success: {
          completed_at: '2026-07-25T11:30:00.000Z',
          trigger: 'admin',
          votesUpserted: 2,
          votesSkipped: 0,
          billsSelected: 2,
          digestsWritten: 1,
          digestsSkipped: 1,
        },
        last_scheduled_success: null,
      }),
    )

    renderDebugPage()

    const scheduledHeading = await screen.findByRole('heading', { name: 'Last scheduled success' })
    const scheduledSection = scheduledHeading.closest('section')
    if (!scheduledSection) throw new Error('expected Last scheduled success section')
    expect(
      within(scheduledSection).getByText('No scheduled success recorded yet.'),
    ).toBeInTheDocument()
  })

  it('distinguishes an admin last_success from a distinct scheduled success', async () => {
    mockMonitor(
      baseIngest({
        last_success: {
          completed_at: '2026-07-25T11:30:00.000Z',
          trigger: 'admin',
          votesUpserted: 2,
          votesSkipped: 0,
          billsSelected: 2,
          digestsWritten: 1,
          digestsSkipped: 1,
        },
        last_scheduled_success: {
          completed_at: '2026-07-24T10:00:00.000Z',
          trigger: 'scheduled',
          votesUpserted: 5,
          votesSkipped: 1,
          billsSelected: 4,
          digestsWritten: 3,
          digestsSkipped: 0,
        },
      }),
    )

    renderDebugPage()

    const lastSuccessHeading = await screen.findByRole('heading', { name: 'Last success' })
    const lastSuccessSection = lastSuccessHeading.closest('section')
    if (!lastSuccessSection) throw new Error('expected Last success section')
    expect(within(lastSuccessSection).getByText('admin')).toBeInTheDocument()

    const scheduledHeading = screen.getByRole('heading', { name: 'Last scheduled success' })
    const scheduledSection = scheduledHeading.closest('section')
    if (!scheduledSection) throw new Error('expected Last scheduled success section')
    expect(within(scheduledSection).getByText('scheduled')).toBeInTheDocument()
    expect(within(scheduledSection).getByText('5')).toBeInTheDocument()
  })

  it('omits the scheduled-success block when it is the same run as last_success', async () => {
    const run = {
      completed_at: '2026-07-25T10:00:00.000Z',
      trigger: 'scheduled' as const,
      votesUpserted: 3,
      votesSkipped: 0,
      billsSelected: 3,
      digestsWritten: 2,
      digestsSkipped: 1,
    }
    mockMonitor(
      baseIngest({
        status: 'ok',
        message: 'Scheduled ingest is fresh.',
        last_success: run,
        last_scheduled_success: run,
      }),
    )

    renderDebugPage()

    expect(await screen.findByRole('heading', { name: 'Last success' })).toBeInTheDocument()
    expect(screen.getByText('scheduled')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Last scheduled success' })).not.toBeInTheDocument()
  })

  it('renders the executive section when present and omits it when absent', async () => {
    mockMonitor(
      baseIngest({
        executive: {
          status: 'ok',
          message: 'Hourly executive ingest is fresh.',
          hourly_cron_utc: '0 * * * *',
          stale_after_hours: 3,
          last_success: {
            completed_at: '2026-07-25T11:00:00.000Z',
            trigger: 'scheduled',
            fetched: 4,
            ingested: 2,
            linked: 1,
            hydrated: 1,
            skipped: 1,
          },
          last_failure: null,
          last_scheduled_success: {
            completed_at: '2026-07-25T11:00:00.000Z',
            trigger: 'scheduled',
            fetched: 4,
            ingested: 2,
            linked: 1,
            hydrated: 1,
            skipped: 1,
          },
          admin_executive_ingest: 'POST /__pipeline/run/executive-posts',
        },
      }),
    )

    const { unmount } = renderDebugPage()

    expect(await screen.findByRole('region', { name: 'Executive ingest status' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Executive posts cron' })).toBeInTheDocument()
    expect(screen.getByText('Hourly executive ingest is fresh.')).toBeInTheDocument()
    expect(screen.getByText('0 * * * *')).toBeInTheDocument()
    expect(screen.getByText('3 hours')).toBeInTheDocument()
    expect(screen.getByText('POST /__pipeline/run/executive-posts')).toBeInTheDocument()

    unmount()
    mockMonitor(baseIngest())
    renderDebugPage()

    expect(await screen.findByRole('heading', { name: 'Daily cron' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Executive ingest status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Executive posts cron' })).not.toBeInTheDocument()
  })

  it('mentions last_skipped in alerting options', async () => {
    mockMonitor(baseIngest())

    renderDebugPage()

    expect(await screen.findByText(/Busy-skip signal/)).toBeInTheDocument()
    expect(screen.getByText('ingest.last_skipped')).toBeInTheDocument()
  })
})
