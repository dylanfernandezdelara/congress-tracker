import { Chat } from '@ai-sdk/react'
import type { ChatTransport } from 'ai'

import type { BillChatMessage } from '../components/BillChatTranscript'

const chats = new Map<string, Chat<BillChatMessage>>()
/** Unsent composer text. Peek unmounts the section, and the rail/drawer swap does too. */
const drafts = new Map<string, string>()

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

export function readBillChatDraft(billId: string): string {
  return drafts.get(billId) ?? ''
}

export function writeBillChatDraft(billId: string, value: string): void {
  if (value.length === 0) drafts.delete(billId)
  else drafts.set(billId, value)
}

export function resetBillChatInstancesForTests(): void {
  chats.clear()
  drafts.clear()
}
