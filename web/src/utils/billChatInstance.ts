import { Chat } from '@ai-sdk/react'
import type { ChatTransport } from 'ai'

import type { BillChatMessage } from '../components/BillChatTranscript'

const chats = new Map<string, Chat<BillChatMessage>>()

/** One Chat per bill so rail ↔ drawer remounts keep the thread. */
export function billChatInstance(
  billId: string,
  transport: ChatTransport<BillChatMessage>,
): Chat<BillChatMessage> {
  const id = `bill-chat-${billId}`
  const existing = chats.get(id)
  if (existing) return existing
  const chat = new Chat<BillChatMessage>({ id, transport })
  chats.set(id, chat)
  return chat
}

export function resetBillChatInstancesForTests(): void {
  chats.clear()
}
