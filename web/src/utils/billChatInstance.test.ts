import { DefaultChatTransport } from 'ai'
import { afterEach, describe, expect, it } from 'vitest'

import {
  billChatInstance,
  readBillChatDraft,
  resetBillChatInstancesForTests,
  writeBillChatDraft,
} from './billChatInstance'

afterEach(() => {
  resetBillChatInstancesForTests()
})

describe('billChatInstance', () => {
  it('returns the same Chat when remounted with a new transport for the same bill', () => {
    const first = billChatInstance('119-s-2', new DefaultChatTransport({ api: '/chat/bill' }))
    const second = billChatInstance('119-s-2', new DefaultChatTransport({ api: '/chat/bill' }))
    const other = billChatInstance('119-hr-1', new DefaultChatTransport({ api: '/chat/bill' }))

    expect(second).toBe(first)
    expect(other).not.toBe(first)
  })

  it('keeps an unsent draft per bill until it is cleared or the test reset runs', () => {
    writeBillChatDraft('119-s-2', 'who pays')
    writeBillChatDraft('119-hr-1', 'other bill')
    expect(readBillChatDraft('119-s-2')).toBe('who pays')
    expect(readBillChatDraft('119-hr-1')).toBe('other bill')

    writeBillChatDraft('119-s-2', '')
    expect(readBillChatDraft('119-s-2')).toBe('')
    expect(readBillChatDraft('119-hr-1')).toBe('other bill')

    resetBillChatInstancesForTests()
    expect(readBillChatDraft('119-hr-1')).toBe('')
  })
})
