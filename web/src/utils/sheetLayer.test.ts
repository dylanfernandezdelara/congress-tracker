import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  registerSheetLayer,
  resetSheetLayerForTests,
  SHEET_BASE_Z_INDEX,
  sheetLayerDepthForTests,
  type SheetLayerController,
} from './sheetLayer'

function controller(overrides: Partial<SheetLayerController> = {}): SheetLayerController {
  return {
    requestClose: vi.fn(),
    getIsClosing: () => false,
    panel: document.createElement('div'),
    ...overrides,
  }
}

afterEach(() => {
  resetSheetLayerForTests()
  document.body.style.overflow = ''
})

describe('sheetLayer', () => {
  it('locks body scroll on the first registration and restores on last unregister', () => {
    document.body.style.overflow = 'auto'
    const first = registerSheetLayer(controller())
    expect(document.body.style.overflow).toBe('hidden')
    expect(sheetLayerDepthForTests()).toBe(1)

    const second = registerSheetLayer(controller())
    expect(document.body.style.overflow).toBe('hidden')
    expect(sheetLayerDepthForTests()).toBe(2)

    first.unregister()
    expect(document.body.style.overflow).toBe('hidden')
    expect(sheetLayerDepthForTests()).toBe(1)

    second.unregister()
    expect(document.body.style.overflow).toBe('auto')
    expect(sheetLayerDepthForTests()).toBe(0)
  })

  it('assigns rising z-index so later sheets paint above earlier ones', () => {
    const first = registerSheetLayer(controller())
    const second = registerSheetLayer(controller())
    expect(first.zIndex).toBe(SHEET_BASE_Z_INDEX)
    expect(second.zIndex).toBe(SHEET_BASE_Z_INDEX + 1)
  })

  it('routes Escape to the top sheet only', () => {
    const lower = controller()
    const upper = controller()
    registerSheetLayer(lower)
    registerSheetLayer(upper)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(upper.requestClose).toHaveBeenCalledTimes(1)
    expect(lower.requestClose).not.toHaveBeenCalled()
  })
})
