import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export type ConversationProps = HTMLAttributes<HTMLDivElement>

export function Conversation({ className, ...props }: ConversationProps) {
  return <div className={cn('bill-chat-conversation', className)} role="log" {...props} />
}

export type ConversationContentProps = HTMLAttributes<HTMLDivElement>

export function ConversationContent({ className, ...props }: ConversationContentProps) {
  return <div className={cn('bill-chat-conversation-content', className)} {...props} />
}
