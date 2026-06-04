import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAsyncData } from './useAsyncData'

describe('useAsyncData', () => {
  it('maps validation errors without calling load', async () => {
    const load = vi.fn()

    const { result } = renderHook(() =>
      useAsyncData({
        deps: [],
        validate: () => 'Missing vote identifier.',
        load,
        mapError: () => 'unexpected',
      }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(load).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Missing vote identifier.')
    expect(result.current.data).toBeNull()
  })

  it('maps fetch errors through mapError', async () => {
    const { result } = renderHook(() =>
      useAsyncData({
        deps: ['119'],
        load: async () => {
          throw new Error('network down')
        },
        mapError: (err) => `Vote detail unavailable. ${err instanceof Error ? err.message : 'unknown'}`,
      }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Vote detail unavailable. network down')
    expect(result.current.data).toBeNull()
  })

  it('resolves successful loads into data', async () => {
    const { result } = renderHook(() =>
      useAsyncData({
        deps: ['119', '2', '14'],
        load: async () => ({ title: 'Rail safety package' }),
        mapError: () => 'unexpected',
      }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual({ title: 'Rail safety package' })
  })
})
