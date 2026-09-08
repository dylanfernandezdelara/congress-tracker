/**
 * Single owner of verification viewport parse, state, and CDP apply/clear.
 */
export const DEFAULT_VIEWPORT = { width: 1280, height: 800 }

export function parseViewportFlags(flags) {
  const width = Number(flags.width)
  const height = Number(flags.height)
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('viewport requires --width > 0')
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error('viewport requires --height > 0')
  }
  const dsfRaw = flags['device-scale-factor']
  let deviceScaleFactor = 1
  if (dsfRaw !== undefined) {
    const dsf = Number(dsfRaw)
    if (!Number.isFinite(dsf) || dsf <= 0) {
      throw new Error('--device-scale-factor must be > 0')
    }
    deviceScaleFactor = dsf
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
    deviceScaleFactor,
    mobile: Boolean(flags.mobile),
  }
}

export function viewportFromState(state) {
  const width = Number(state?.viewport?.width)
  const height = Number(state?.viewport?.height)
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : DEFAULT_VIEWPORT.width,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : DEFAULT_VIEWPORT.height,
  }
}

export function deviceMetricsFromState(state) {
  const viewport = viewportFromState(state)
  const dsf = Number(state?.viewport?.deviceScaleFactor)
  return {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: Number.isFinite(dsf) && dsf > 0 ? dsf : 1,
    mobile: Boolean(state?.viewport?.mobile),
  }
}

export function viewportFromCdpFlags(flags) {
  if (flags.method !== 'Emulation.setDeviceMetricsOverride') return null
  let params = {}
  if (typeof flags.params === 'string' && flags.params.trim()) {
    try {
      params = JSON.parse(flags.params)
    } catch {
      return null
    }
  } else if (flags.params && typeof flags.params === 'object' && !Array.isArray(flags.params)) {
    params = flags.params
  } else {
    return null
  }
  const width = Number(params.width)
  const height = Number(params.height)
  if (!Number.isFinite(width) || width <= 0) return null
  const dsf = Number(params.deviceScaleFactor)
  return {
    width: Math.round(width),
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : DEFAULT_VIEWPORT.height,
    deviceScaleFactor: Number.isFinite(dsf) && dsf > 0 ? dsf : 1,
    mobile: Boolean(params.mobile),
  }
}

export function shouldClearDeviceMetrics(metrics) {
  return !metrics.mobile && metrics.deviceScaleFactor === 1
}

export async function applyViewport(page, state) {
  const metrics = deviceMetricsFromState(state)
  await page.setViewportSize({ width: metrics.width, height: metrics.height })
  const session = await page.context().newCDPSession(page)
  if (shouldClearDeviceMetrics(metrics)) {
    await session.send('Emulation.clearDeviceMetricsOverride')
    return metrics
  }
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: metrics.width,
    height: metrics.height,
    deviceScaleFactor: metrics.deviceScaleFactor,
    mobile: metrics.mobile,
  })
  return metrics
}
