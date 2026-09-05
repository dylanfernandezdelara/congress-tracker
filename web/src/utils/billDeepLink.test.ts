import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import {
  billSearchQueryFromParam,
  billShareOrigin,
  buildBillSharePayload,
  buildBillShareUrl,
  canUseWebShare,
  copyTextToClipboard,
  feedRowKey,
  formatBillQueryParam,
  itemMatchesBillParam,
  PRODUCTION_ORIGIN,
  shareBillViaNavigator,
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

  it('builds a clean share URL on the current origin', () => {
    const item = makeFeedItem({ bill: { congress: 119, type: 'HR', number: 1, title: null } })
    expect(buildBillShareUrl(item, 'https://example.test/?chamber=House&other=1')).toBe(
      'https://example.test/?bill=119-hr-1',
    )
  })

  it('rewrites production hosts to the apex origin', () => {
    const item = makeFeedItem({ bill: { congress: 119, type: 'HR', number: 1, title: null } })
    expect(billShareOrigin('https://www.trackcongress.org/?q=1')).toBe(PRODUCTION_ORIGIN)
    expect(buildBillShareUrl(item, 'https://trackcongress.org/?chamber=House')).toBe(
      `${PRODUCTION_ORIGIN}/?bill=119-hr-1`,
    )
    expect(billShareOrigin('https://congress-tracker-api.example.workers.dev/')).toBe(
      'https://congress-tracker-api.example.workers.dev',
    )
  })

  it('builds paste-ready share text from digest fields', () => {
    const item = makeFeedItem()
    const payload = buildBillSharePayload(item, undefined, 'https://preview.test/')
    expect(payload.title).toBe('Plain headline for readers')
    expect(payload.text).toBe('It does something important in plain language.')
    expect(payload.url).toBe('https://preview.test/?bill=119-s-2')
    expect(payload.clipboardText).toBe(
      'Plain headline for readers\n\nIt does something important in plain language.\n\nhttps://preview.test/?bill=119-s-2',
    )
  })

  it('falls back to title-only text when the digest is thin', () => {
    const item = makeFeedItem({
      digest: null,
      raw_summary_text: null,
      bill: { congress: 119, type: 'HR', number: 4795, title: 'A short title-only intro' },
    })
    const payload = buildBillSharePayload(item, undefined, 'https://preview.test/')
    expect(payload.title).toBe('A short title-only intro')
    expect(payload.text).toBe('A short title-only intro')
    expect(payload.clipboardText).toContain('https://preview.test/?bill=119-hr-4795')
  })

  it('maps a bill param to a feed search query', () => {
    expect(billSearchQueryFromParam('119-hr-1')).toBe('H.R. 1')
    expect(billSearchQueryFromParam('119-s-9901')).toBe('S. 9901')
    expect(billSearchQueryFromParam('')).toBeNull()
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

  it('shares via navigator.share and treats cancel as cancelled', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(canUseWebShare()).toBe(true)

    const payload = buildBillSharePayload(makeFeedItem(), undefined, 'https://preview.test/')
    await expect(shareBillViaNavigator(payload)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({
      title: payload.title,
      text: payload.text,
      url: payload.url,
    })

    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    await expect(shareBillViaNavigator(payload)).resolves.toBe('cancelled')
  })
})
