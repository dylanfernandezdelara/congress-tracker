import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

import { AppLayout } from '../layouts/AppLayout'
import alignGridCss from '../styles/align-grid.css?raw'
import { ALIGN_GRID_ON, copyAlignGridParam, isAlignGridQuery, useAlignGrid } from './useAlignGrid'

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

/** Rule selectors in `css`, comments stripped. `@media` / `@layer` heads contain `@` and are skipped. */
function ruleSelectors(css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []
  for (const match of stripped.matchAll(/([^{}@]+)\{/g)) {
    const head = match[1] ?? ''
    for (const part of head.split(',')) {
      const sel = part.trim()
      if (sel) selectors.push(sel)
    }
  }
  return selectors
}

describe('align-grid.css', () => {
  it('scopes every ::before rule to [data-align-grid]', () => {
    // jsdom does not compute ::before styles, so this walks the stylesheet
    // instead. An unconditioned `html::before` anywhere in the file — including
    // after the gated rule, which a from-start regex would miss — fails here.
    const befores = ruleSelectors(alignGridCss).filter((sel) => sel.includes('::before'))
    expect(befores.length).toBeGreaterThan(0)
    for (const sel of befores) {
      expect(sel).toContain('[data-align-grid]')
    }
    expect(alignGridCss).toContain('pointer-events: none')
  })

  it('flags an unconditioned ::before that follows a gated one', () => {
    const css = 'html[data-align-grid]::before { content: ""; } html::before { content: ""; }'
    const befores = ruleSelectors(css).filter((sel) => sel.includes('::before'))
    expect(befores.some((sel) => !sel.includes('[data-align-grid]'))).toBe(true)
  })
})
