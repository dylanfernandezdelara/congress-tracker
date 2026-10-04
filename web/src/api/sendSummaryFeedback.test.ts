import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.com' }))

import { SUMMARY_FEEDBACK_FAILURES_KEY, sendSummaryFeedback } from './client'

describe('sendSummaryFeedback', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    window.sessionStorage.clear()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    warn.mockRestore()
    window.sessionStorage.clear()
  })

  it('posts the feedback as JSON and resolves true on 2xx, without logging', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendSummaryFeedback({ bill: '119-hr-1', kind: 'helpful' })).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/feedback/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"bill":"119-hr-1","kind":"helpful"}',
    })
    expect(warn).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(SUMMARY_FEEDBACK_FAILURES_KEY)).toBeNull()
  })

  it('warns once per session with the status and counts every failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"forbidden_origin"}', { status: 403 })))

    await expect(sendSummaryFeedback({ bill: '119-hr-1', kind: 'helpful' })).resolves.toBe(false)
    await expect(sendSummaryFeedback({ bill: '119-hr-1', kind: 'unhelpful' })).resolves.toBe(false)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('HTTP 403')
    expect(window.sessionStorage.getItem(SUMMARY_FEEDBACK_FAILURES_KEY)).toBe('2')
  })

  it('treats a network failure as a failed post instead of rejecting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(sendSummaryFeedback({ bill: '119-hr-1', kind: 'mistake', note: 'x' })).resolves.toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('network error: Failed to fetch')
    expect(window.sessionStorage.getItem(SUMMARY_FEEDBACK_FAILURES_KEY)).toBe('1')
  })
})
