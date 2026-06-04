import { devices } from '@playwright/test'

/** Mobile-first default; set VIEWPORT=desktop for 1280×720. */
export function resolveViewportProfile(env = process.env) {
  const mode = (env.VIEWPORT ?? 'mobile').trim().toLowerCase()
  if (mode === 'desktop') {
    return {
      tag: 'desktop',
      context: { viewport: { width: 1280, height: 720 } },
    }
  }
  if (mode === 'mobile') {
    const profile = { ...devices['iPhone 13'] }
    if (env.SNAPSHOT_DPR === '1') {
      profile.deviceScaleFactor = 1
    }
    return { tag: 'mobile', context: profile }
  }
  const match = /^(\d{3,4})x(\d{3,5})$/.exec(mode)
  if (match) {
    const width = Number(match[1])
    const height = Number(match[2])
    const dpr = env.SNAPSHOT_DPR === '1' ? 1 : 2
    return {
      tag: `${width}x${height}`,
      context: { viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true },
    }
  }
  const profile = { ...devices['iPhone 13'] }
  if (env.SNAPSHOT_DPR === '1') {
    profile.deviceScaleFactor = 1
  }
  return { tag: 'mobile', context: profile }
}

export function buildSnapshotOutputPath({ outDir, safeName, viewportTag, outOverride }) {
  if (outOverride) return outOverride
  return `${outDir}/${safeName}_${viewportTag}.png`
}

export function isIgnorableRequestFailure(failureText = '') {
  const text = failureText.toLowerCase()
  return (
    text.includes('err_aborted') ||
    text.includes('ns_binding_aborted') ||
    text.includes('canceled') ||
    text.includes('cancelled')
  )
}
