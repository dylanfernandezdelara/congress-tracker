import { useCallback } from 'react'
import { useE2eMode } from './useE2eMode'

export function useE2eLink(): (path: string) => string {
  const e2eMode = useE2eMode()

  return useCallback(
    (path: string) => {
      if (!e2eMode) return path
      const [pathname, search = ''] = path.split('?')
      const params = new URLSearchParams(search)
      params.set('e2e', '1')
      const query = params.toString()
      return query ? `${pathname}?${query}` : `${pathname}?e2e=1`
    },
    [e2eMode],
  )
}
