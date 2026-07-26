import { describe, expect, it } from 'vitest'

import type { FeedPipelineRunRecord } from '@congress-tracker/shared/ingest-api-types'

import { isSameRun, isSkipSuperseded } from './ingestMonitorDisplay'

const scheduledRun = (completed_at: string): FeedPipelineRunRecord => ({
  completed_at,
  trigger: 'scheduled',
  votesUpserted: 1,
  votesSkipped: 0,
  billsSelected: 1,
  digestsWritten: 1,
  digestsSkipped: 0,
})

describe('isSameRun', () => {
  it('collapses two nulls and identical runs', () => {
    expect(isSameRun(null, null)).toBe(true)
    const run = { completed_at: '2026-07-25T10:00:00.000Z', trigger: 'scheduled' as const }
    expect(isSameRun(run, { ...run })).toBe(true)
  })

  it('keeps admin success distinct from a missing or different scheduled run', () => {
    const admin = { completed_at: '2026-07-25T11:30:00.000Z', trigger: 'admin' as const }
    expect(isSameRun(admin, null)).toBe(false)
    expect(
      isSameRun(admin, { completed_at: '2026-07-24T10:00:00.000Z', trigger: 'scheduled' }),
    ).toBe(false)
  })
})

describe('isSkipSuperseded', () => {
  const skip = {
    skipped_at: '2026-07-20T10:00:00.000Z',
    trigger: 'scheduled' as const,
    reason: 'pipeline_busy' as const,
  }

  it('is true only when a later scheduled success exists', () => {
    expect(isSkipSuperseded(skip, null)).toBe(false)
    expect(isSkipSuperseded(skip, scheduledRun('2026-07-25T10:00:00.000Z'))).toBe(true)
    expect(isSkipSuperseded(skip, scheduledRun('2026-07-19T10:00:00.000Z'))).toBe(false)
  })
})
