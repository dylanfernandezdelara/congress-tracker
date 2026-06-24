import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** Re-renders when `document.documentElement.dataset.theme` changes. */
export function useDocumentTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => readTheme())

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setTheme(readTheme())
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
