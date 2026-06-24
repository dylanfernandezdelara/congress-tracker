import { useEffect, useState } from 'react'

const NARROW_BREAKPOINT = 640

export type ChamberDiagramMode = '3d' | '2d'

function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

function resolveMode(): ChamberDiagramMode {
  if (typeof window === 'undefined') return '2d'
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const narrow = window.innerWidth <= NARROW_BREAKPOINT
  const webgl = detectWebGL()
  return prefersReduced || narrow || !webgl ? '2d' : '3d'
}

export function useChamberDiagramMode(): ChamberDiagramMode {
  const [mode, setMode] = useState<ChamberDiagramMode>(resolveMode)

  useEffect(() => {
    setMode(resolveMode())

    const onResize = () => setMode(resolveMode())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return mode
}
