const FLAG_DEFAULTS: Record<string, boolean> = {
  insightFeed: true,
}

export function getFeatureFlag(name: string): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    const override = params.get(`ff_${name}`)
    if (override === '1' || override === 'true') return true
    if (override === '0' || override === 'false') return false
  } catch {
    // SSR or restricted environment
  }

  try {
    const stored = localStorage.getItem(`ff_${name}`)
    if (stored === '1' || stored === 'true') return true
    if (stored === '0' || stored === 'false') return false
  } catch {
    // localStorage unavailable
  }

  return FLAG_DEFAULTS[name] ?? false
}
