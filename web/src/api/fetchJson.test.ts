import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, buildApiUrl, fetchJson } from './fetchJson'

vi.mock('./config', () => ({
  getApiBaseUrl: () => 'https://api.example.com',
}))

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds API paths from the configured base URL', () => {
    expect(buildApiUrl('/briefings/latest.json')).toBe('https://api.example.com/briefings/latest.json')
    expect(buildApiUrl('votes/119/2/14.json')).toBe('https://api.example.com/votes/119/2/14.json')
  })

  it('returns parsed JSON for OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, statusText: 'OK' })),
    )

    await expect(fetchJson<{ ok: boolean }>('/briefings/latest.json')).resolves.toEqual({ ok: true })
  })

  it('throws ApiError for non-OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' })),
    )

    await expect(fetchJson('/votes/119/2/14.json')).rejects.toBeInstanceOf(ApiError)
    await expect(fetchJson('/votes/119/2/14.json')).rejects.toMatchObject({ status: 404 })
  })

  it('throws a network error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down')
    }))

    await expect(fetchJson('/briefings/latest.json')).rejects.toThrow(/internet connection/i)
  })

  it('throws when the response body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not-json', { status: 200, statusText: 'OK' })),
    )

    await expect(fetchJson('/briefings/latest.json')).rejects.toThrow(/invalid data/i)
  })
})
