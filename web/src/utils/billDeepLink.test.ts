import { afterEach, describe, expect, it, vi } from 'vitest'

import { toastManager } from '@/lib/toast'

import { makeFeedItem } from '../test/feedItemFixtures'
import {
  billSearchQueryFromParam,
  billShareOrigin,
  buildBillSharePayload,
  buildBillShareUrl,
  clearBillDeepLinkParams,
  canUseWebShare,
  copyTextToClipboard,
  feedRowKey,
  formatBillQueryParam,
  itemMatchesBillParam,
  PRODUCTION_ORIGIN,
  shareBill,
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

  it('clears the bill deep link together with a legacy quote id', () => {
    const params = new URLSearchParams('bill=119-hr-1&quote=abc&chamber=House')
    clearBillDeepLinkParams(params)
    expect(params.toString()).toBe('chamber=House')
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

  it('shares the headline and the link, nothing else', () => {
    const payload = buildBillSharePayload(makeFeedItem(), undefined, 'https://preview.test/')
    expect(payload).toEqual({ title: 'Plain headline for readers', url: 'https://preview.test/?bill=119-s-2' })
  })

  it('falls back to the bill title when there is no digest', () => {
    const item = makeFeedItem({
      digest: null,
      raw_summary_text: null,
      bill: { congress: 119, type: 'HR', number: 4795, title: 'A short title-only intro' },
    })
    const payload = buildBillSharePayload(item, undefined, 'https://preview.test/')
    expect(payload).toEqual({ title: 'A short title-only intro', url: 'https://preview.test/?bill=119-hr-4795' })
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
    expect(share).toHaveBeenCalledWith({ title: payload.title, url: payload.url })

    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    await expect(shareBillViaNavigator(payload)).resolves.toBe('cancelled')
  })

  describe('shareBill', () => {
    it('opens the share sheet and shows no toast', async () => {
      const share = vi.fn().mockResolvedValue(undefined)
      const writeText = vi.fn()
      vi.stubGlobal('navigator', { share, clipboard: { writeText } })
      const add = vi.spyOn(toastManager, 'add')

      await shareBill(makeFeedItem())

      expect(share).toHaveBeenCalledTimes(1)
      expect(share.mock.calls[0]![0].url).toMatch(/\?bill=119-s-2$/)
      expect(writeText).not.toHaveBeenCalled()
      expect(add).not.toHaveBeenCalled()
    })

    it('does nothing more when the reader dismisses the share sheet', async () => {
      const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
      const writeText = vi.fn()
      vi.stubGlobal('navigator', { share, clipboard: { writeText } })
      const add = vi.spyOn(toastManager, 'add')

      await shareBill(makeFeedItem())

      expect(writeText).not.toHaveBeenCalled()
      expect(add).not.toHaveBeenCalled()
    })

    it('copies the link and says so where there is no share sheet', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      const add = vi.spyOn(toastManager, 'add')

      await shareBill(makeFeedItem())

      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?bill=119-s-2$/))
      expect(add).toHaveBeenCalledWith({ title: 'Link copied' })
    })

    it('copies the link when the share sheet is refused', async () => {
      const share = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'))
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { share, clipboard: { writeText } })
      const add = vi.spyOn(toastManager, 'add')

      await shareBill(makeFeedItem())

      expect(writeText).toHaveBeenCalledTimes(1)
      expect(add).toHaveBeenCalledWith({ title: 'Link copied' })
    })
  })
})
