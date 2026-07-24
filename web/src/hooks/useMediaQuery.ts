import { useCallback, useSyncExternalStore } from 'react'

function getMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(query).matches
}

/**
 * Subscribe to a CSS media query. Defaults to `false` when `window` /
 * `matchMedia` is unavailable (SSR / early boot).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {}
      }

      const mediaQueryList = window.matchMedia(query)
      const onChange = () => {
        onStoreChange()
      }

      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', onChange)
        return () => mediaQueryList.removeEventListener('change', onChange)
      }

      mediaQueryList.addListener(onChange)
      return () => mediaQueryList.removeListener(onChange)
    },
    [query],
  )

  return useSyncExternalStore(subscribe, () => getMatches(query), () => false)
}
