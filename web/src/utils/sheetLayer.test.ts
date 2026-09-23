import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  closeTopSheet,
  handEscapeToTopSheet,
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

  it('lets a focused control claim Escape before the top sheet closes', async () => {
    const layer = controller()
    registerSheetLayer(layer)
    const input = document.createElement('input')
    document.body.append(input)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.preventDefault()
    })
    input.addEventListener('keydown', handEscapeToTopSheet, { capture: true })

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await Promise.resolve()

    expect(layer.requestClose).not.toHaveBeenCalled()
    input.remove()
  })

  it('closes the top sheet after Escape when no focused control claims it', async () => {
    const layer = controller()
    registerSheetLayer(layer)
    const input = document.createElement('input')
    document.body.append(input)
    input.addEventListener('keydown', handEscapeToTopSheet, { capture: true })

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(layer.requestClose).not.toHaveBeenCalled()
    await Promise.resolve()

    expect(layer.requestClose).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('lets a dismissable layer hand Escape to the top sheet without a double close', () => {
    const lower = controller()
    const upper = controller()
    registerSheetLayer(lower)
    registerSheetLayer(upper)

    // Mirrors the mobile chat drawer: Radix sees the key first, the drawer
    // closes the top sheet and prevents default, then the window listener runs.
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    expect(closeTopSheet()).toBe(true)
    event.preventDefault()
    window.dispatchEvent(event)

    expect(upper.requestClose).toHaveBeenCalledTimes(1)
    expect(lower.requestClose).not.toHaveBeenCalled()
  })

  it('reports no sheet to close when the stack is empty or the top is already closing', () => {
    expect(closeTopSheet()).toBe(false)
    const closing = controller({ getIsClosing: () => true })
    registerSheetLayer(closing)
    expect(closeTopSheet()).toBe(false)
    expect(closing.requestClose).not.toHaveBeenCalled()
  })

  it('ignores Escape when a nested handler already prevented default', () => {
    const layer = controller()
    registerSheetLayer(layer)

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    Object.defineProperty(event, 'defaultPrevented', { get: () => true })
    window.dispatchEvent(event)

    expect(layer.requestClose).not.toHaveBeenCalled()
  })

  it('traps Tab across inputs and selects inside the panel', () => {
    const panel = document.createElement('div')
    const first = document.createElement('button')
    first.textContent = 'Done'
    const input = document.createElement('input')
    const select = document.createElement('select')
    panel.append(first, input, select)
    document.body.append(panel)
    registerSheetLayer(controller({ panel }))

    select.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    window.dispatchEvent(tab)

    expect(document.activeElement).toBe(first)
    panel.remove()
  })
})
