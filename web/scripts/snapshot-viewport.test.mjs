import { describe, expect, it } from 'vitest'
import {
  buildSnapshotOutputPath,
  isIgnorableRequestFailure,
  resolveViewportProfile,
} from './snapshot-viewport.mjs'

describe('resolveViewportProfile', () => {
  it('defaults to mobile', () => {
    const profile = resolveViewportProfile({})
    expect(profile.tag).toBe('mobile')
    expect(profile.context.viewport?.width).toBe(390)
  })

  it('supports desktop mode', () => {
    const profile = resolveViewportProfile({ VIEWPORT: 'desktop' })
    expect(profile.tag).toBe('desktop')
    expect(profile.context.viewport).toEqual({ width: 1280, height: 720 })
  })

  it('supports custom WxH mode', () => {
    const profile = resolveViewportProfile({ VIEWPORT: '390x844' })
    expect(profile.tag).toBe('390x844')
    expect(profile.context.viewport).toEqual({ width: 390, height: 844 })
  })
})

describe('buildSnapshotOutputPath', () => {
  it('suffixes viewport tag', () => {
    expect(
      buildSnapshotOutputPath({
        outDir: 'artifacts',
        safeName: 'home',
        viewportTag: 'mobile',
        outOverride: undefined,
      }),
    ).toBe('artifacts/home_mobile.png')
  })
})

describe('isIgnorableRequestFailure', () => {
  it('ignores navigation abort noise', () => {
    expect(isIgnorableRequestFailure('net::ERR_ABORTED')).toBe(true)
    expect(isIgnorableRequestFailure('NS_BINDING_ABORTED')).toBe(true)
  })

  it('keeps real failures', () => {
    expect(isIgnorableRequestFailure('net::ERR_CONNECTION_REFUSED')).toBe(false)
  })
})
