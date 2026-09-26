import { afterEach, describe, expect, it, vi } from 'vitest'

import { readQuotableSelection } from './useTextSelectionMenu'

function stubSelection(range: Range, text: string) {
  const selection = {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => text,
    removeAllRanges: vi.fn(),
  }
  vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
  // jsdom Ranges have no layout; give the range a viewport box.
  ;(range as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    new DOMRect(10, 20, 100, 16)
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('readQuotableSelection', () => {
  it('returns the collapsed text and source for a selection inside one quotable region', () => {
    document.body.innerHTML =
      '<div id="c"><p data-quotable="crs">Official   summary text here.</p><p>Not quotable</p></div>'
    const container = document.getElementById('c')!
    const paragraph = container.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    stubSelection(range, 'Official   summary')

    expect(readQuotableSelection(container)).toMatchObject({
      text: 'Official summary',
      source: 'crs',
    })
  })

  it('ignores selections outside quotable regions or spanning two of them', () => {
    document.body.innerHTML =
      '<div id="c"><p data-quotable="digest">One</p><p data-quotable="digest">Two</p><p id="plain">Plain</p></div>'
    const container = document.getElementById('c')!
    const [first, second] = Array.from(container.querySelectorAll('p'))

    const spanning = document.createRange()
    spanning.setStart(first!.firstChild!, 0)
    spanning.setEnd(second!.firstChild!, 2)
    stubSelection(spanning, 'One Tw')
    expect(readQuotableSelection(container)).toBeNull()

    const plain = document.createRange()
    plain.selectNodeContents(document.getElementById('plain')!)
    stubSelection(plain, 'Plain')
    expect(readQuotableSelection(container)).toBeNull()
  })

  it('returns null for collapsed selections or when the container is missing', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
    } as unknown as Selection)
    expect(readQuotableSelection(document.body)).toBeNull()
    expect(readQuotableSelection(null)).toBeNull()
  })
})
