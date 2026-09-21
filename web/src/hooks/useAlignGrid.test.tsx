import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

import { AppLayout } from '../layouts/AppLayout'
import alignGridCss from '../styles/align-grid.css?raw'
import { ALIGN_GRID_ON, isAlignGridQuery, useAlignGrid } from './useAlignGrid'

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
  it('paints lines only under [data-align-grid]', () => {
    // The overlay must stay opt-in: an unconditioned `html::before` would
    // draw the grid on production and in qa:web screenshots.
    expect(alignGridCss).toContain('html[data-align-grid]::before')
    expect(alignGridCss).toContain('pointer-events: none')
    expect(alignGridCss).not.toMatch(/^[^[]*html::before/)
  })
})
