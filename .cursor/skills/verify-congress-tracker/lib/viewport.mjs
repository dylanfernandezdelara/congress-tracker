/**
 * Single owner of verification viewport parse, state, and CDP apply.
 */
export const DEFAULT_METRICS = Object.freeze({
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
})

export function normalizeMetrics({ width, height, deviceScaleFactor, mobile } = {}) {
  const nextWidth = Number(width)
  const nextHeight = Number(height)
  const nextScale = Number(deviceScaleFactor)
  return {
    width: Number.isFinite(nextWidth) && nextWidth > 0 ? Math.round(nextWidth) : DEFAULT_METRICS.width,
    height: Number.isFinite(nextHeight) && nextHeight > 0 ? Math.round(nextHeight) : DEFAULT_METRICS.height,
    deviceScaleFactor:
      Number.isFinite(nextScale) && nextScale > 0 ? nextScale : DEFAULT_METRICS.deviceScaleFactor,
    mobile: mobile === true,
  }
}

export function parseViewportFlags(flags) {
  const width = Number(flags.width)
  const height = Number(flags.height)
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('viewport requires --width > 0')
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error('viewport requires --height > 0')
  }
  if (flags['device-scale-factor'] !== undefined) {
    const dsf = Number(flags['device-scale-factor'])
    if (!Number.isFinite(dsf) || dsf <= 0) {
      throw new Error('--device-scale-factor must be > 0')
    }
  }
  return normalizeMetrics({
    width,
    height,
    deviceScaleFactor: flags['device-scale-factor'],
    mobile: flags.mobile === true,
  })
}

export function deviceMetricsFromState(state) {
  return normalizeMetrics({
    width: state?.viewport?.width,
    height: state?.viewport?.height,
    deviceScaleFactor: state?.viewport?.deviceScaleFactor,
    mobile: state?.viewport?.mobile,
  })
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
  if (!Number.isFinite(width) || width <= 0) return null
  return normalizeMetrics({
    width,
    height: params.height,
    deviceScaleFactor: params.deviceScaleFactor,
    mobile: params.mobile,
  })
}

function defaultSession(page) {
  return page.context().newCDPSession(page)
}

export async function applyViewport(page, metrics, sessionFactory = defaultSession) {
  const next = normalizeMetrics(metrics)
  await page.setViewportSize({ width: next.width, height: next.height })
  const session = await sessionFactory(page)
  // Always replace the override. Playwright's setViewportSize is the same CDP
  // method and caches the last size; clearDeviceMetricsOverride would wipe it
  // while leaving that cache intact, so the next 1280×800 set is a no-op.
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: next.width,
    height: next.height,
    deviceScaleFactor: next.deviceScaleFactor,
    mobile: next.mobile,
  })
  return next
}
