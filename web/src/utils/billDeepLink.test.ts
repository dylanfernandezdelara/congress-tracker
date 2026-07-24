import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import {
  buildBillShareUrl,
  copyTextToClipboard,
  feedRowKey,
  formatBillQueryParam,
  itemMatchesBillParam,
} from './billDeepLink'

describe('billDeepLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('formats bill query params with lowercase type', () => {
    expect(formatBillQueryParam({ congress: 119, type: 'HR', number: 1 })).toBe('119-hr-1')
    expect(feedRowKey(makeFeedItem())).toBe('119-S-2')
  })

  it('matches bill params case-insensitively on type', () => {
    const item = makeFeedItem({ bill: { congress: 119, type: 'HR', number: 1, title: null } })
    expect(itemMatchesBillParam(item, '119-hr-1')).toBe(true)
    expect(itemMatchesBillParam(item, '119-HR-1')).toBe(true)
    expect(itemMatchesBillParam(item, '119-s-2')).toBe(false)
  })

  it('builds a share URL that preserves chamber and sets bill', () => {
    const item = makeFeedItem({ bill: { congress: 119, type: 'HR', number: 1, title: null } })
    const url = new URL(buildBillShareUrl(item, 'https://example.test/?chamber=House&other=1'))
    expect(url.searchParams.get('chamber')).toBe('House')
    expect(url.searchParams.get('other')).toBe('1')
    expect(url.searchParams.get('bill')).toBe('119-hr-1')
  })

  it('copies via clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyTextToClipboard('https://example.test/?bill=119-hr-1')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.test/?bill=119-hr-1')
  })

  it('falls back to prompt when clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('https://example.test/')

    await expect(copyTextToClipboard('https://example.test/')).resolves.toBe(true)
    expect(prompt).toHaveBeenCalledWith('Copy link', 'https://example.test/')
  })
})
