import { describe, expect, it } from 'vitest'

import {
  BILL_CHAT_DRAWER_FULL,
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_PEEK,
  billChatDrawerSnap,
} from './BillChatLayout'

describe('billChatDrawerSnap', () => {
  it('maps vaul snap points to peek, half, and full', () => {
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_PEEK)).toBe('peek')
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_HALF)).toBe('half')
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_FULL)).toBe('full')
    expect(billChatDrawerSnap(null)).toBe('peek')
  })
})
