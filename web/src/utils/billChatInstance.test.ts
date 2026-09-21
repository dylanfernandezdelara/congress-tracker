import { DefaultChatTransport } from 'ai'
import { afterEach, describe, expect, it } from 'vitest'

import { billChatInstance, resetBillChatInstancesForTests } from './billChatInstance'

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
})
