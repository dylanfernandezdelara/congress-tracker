import { useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export const ALIGN_GRID_QUERY = 'align'
export const ALIGN_GRID_ON = '1'

const ALIGN_GRID_VALUES = new Set(['1', 'grid', 'true', 'on'])

/** True for `?align=1`, `?align=grid`, `?align=true`, or `?align=on`. */
export function isAlignGridQuery(value: string | null): boolean {
  if (!value) return false
  return ALIGN_GRID_VALUES.has(value.trim().toLowerCase())
}

/** Keep `?align=` across navigations that otherwise replace the query. */
export function copyAlignGridParam(from: URLSearchParams, to: URLSearchParams): void {
  const align = from.get(ALIGN_GRID_QUERY)
  if (align) to.set(ALIGN_GRID_QUERY, align)
}

/**
 * Opt-in 8px alignment overlay for layout work. Reads `?align=` and sets
 * `document.documentElement.dataset.alignGrid`. Production and qa:web omit
 * the param, so the lines never show.
 */
export function useAlignGrid(): void {
  const [searchParams] = useSearchParams()
  const enabled = isAlignGridQuery(searchParams.get(ALIGN_GRID_QUERY))

  useLayoutEffect(() => {
    const root = document.documentElement
    if (enabled) {
      root.dataset.alignGrid = ALIGN_GRID_ON
    } else {
      delete root.dataset.alignGrid
    }
    return () => {
      delete root.dataset.alignGrid
    }
  }, [enabled])
}
