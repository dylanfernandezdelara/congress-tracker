import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

import { AppLayout } from '../layouts/AppLayout'
import alignGridCss from '../styles/align-grid.css?raw'
import baseCss from '../styles/base.css?raw'
import billChatCss from '../styles/bill-chat.css?raw'
import chromeCss from '../styles/chrome.css?raw'
import homeCss from '../styles/home.css?raw'
import {
  ALIGN_GRID_ON,
  copyAlignGridParam,
  isAlignGridQuery,
  useAlignGrid,
} from './useAlignGrid'

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function AlignHarness({ children }: { children?: ReactNode }) {
  useAlignGrid()
  return children ?? null
}

function renderAlign(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AlignHarness />
    </MemoryRouter>,
  )
}

describe('isAlignGridQuery', () => {
  it('accepts the documented opt-in values and rejects the rest', () => {
    expect(isAlignGridQuery('1')).toBe(true)
    expect(isAlignGridQuery('grid')).toBe(true)
    expect(isAlignGridQuery('true')).toBe(true)
    expect(isAlignGridQuery('on')).toBe(true)
    expect(isAlignGridQuery('GRID')).toBe(true)
    expect(isAlignGridQuery('0')).toBe(false)
    expect(isAlignGridQuery('off')).toBe(false)
    expect(isAlignGridQuery('')).toBe(false)
    expect(isAlignGridQuery(null)).toBe(false)
  })
})

describe('copyAlignGridParam', () => {
  it('copies align onto a replacement query and ignores other keys', () => {
    const next = new URLSearchParams()
    next.set('bill', '119-hr-1')
    copyAlignGridParam(new URLSearchParams('align=1&chamber=Senate'), next)
    expect(next.get('bill')).toBe('119-hr-1')
    expect(next.get('align')).toBe('1')
    expect(next.get('chamber')).toBeNull()
  })

  it('leaves the target alone when align is absent', () => {
    const next = new URLSearchParams('bill=119-hr-1')
    copyAlignGridParam(new URLSearchParams('chamber=Senate'), next)
    expect(next.toString()).toBe('bill=119-hr-1')
  })
})

describe('useAlignGrid', () => {
  afterEach(() => {
    delete document.documentElement.dataset.alignGrid
  })

  it('sets data-align-grid from ?align=1 and clears it on unmount', () => {
    const { unmount } = renderAlign('/?align=1')
    expect(document.documentElement.dataset.alignGrid).toBe(ALIGN_GRID_ON)
    unmount()
    expect(document.documentElement.dataset.alignGrid).toBeUndefined()
  })

  it('treats ?align=grid as on', () => {
    renderAlign('/?align=grid')
    expect(document.documentElement.dataset.alignGrid).toBe(ALIGN_GRID_ON)
  })

  it('leaves the attribute off when align is absent or disabled', () => {
    renderAlign('/')
    expect(document.documentElement.dataset.alignGrid).toBeUndefined()
    renderAlign('/?align=0')
    expect(document.documentElement.dataset.alignGrid).toBeUndefined()
  })
})

describe('AppLayout align overlay', () => {
  afterEach(() => {
    delete document.documentElement.dataset.alignGrid
  })

  it('wires the hook so ?align=1 marks the document root', () => {
    render(
      <MemoryRouter initialEntries={['/?align=1']} future={routerFuture}>
        <AppLayout />
      </MemoryRouter>,
    )
    expect(document.documentElement.dataset.alignGrid).toBe(ALIGN_GRID_ON)
  })

  it('does not mark the root on a normal page URL', () => {
    render(
      <MemoryRouter initialEntries={['/?bill=119-hr-1']} future={routerFuture}>
        <AppLayout />
      </MemoryRouter>,
    )
    expect(document.documentElement.dataset.alignGrid).toBeUndefined()
  })
})

describe('align-grid.css', () => {
  it('defines an 8px token on :root and paints lines only under [data-align-grid]', () => {
    expect(baseCss).toContain('--grid: 8px')
    expect(baseCss).toContain('--space-1: var(--grid)')
    expect(alignGridCss).toContain('html[data-align-grid]::before')
    expect(alignGridCss).toContain('pointer-events: none')
    expect(alignGridCss).not.toMatch(/^[^[]*html::before/)
    const overlayIndex = alignGridCss.indexOf('html[data-align-grid]::before')
    expect(overlayIndex).toBeGreaterThan(-1)
    expect(alignGridCss.includes('repeating-linear-gradient', overlayIndex)).toBe(true)
  })

  it('keeps page chrome and the reading rail on space tokens', () => {
    expect(chromeCss).toContain('margin-top: var(--space-2)')
    expect(chromeCss).toContain('height: var(--site-header-height)')
    expect(chromeCss).toContain('box-shadow: inset 0 -1px 0 hsl(var(--twc-border))')
    expect(homeCss).toContain('minmax(336px, 26vw)')
    expect(homeCss).toContain('top: var(--site-rail-top)')
    expect(homeCss).toContain('height: calc(100vh - var(--site-rail-top) - var(--site-rail-bottom))')
    expect(billChatCss).toContain('--bill-chat-peek: 128px')
    expect(billChatCss).not.toContain('bill-chat-prompt-footer')
    expect(baseCss).toContain('--site-header-height: 48px')
  })
})
