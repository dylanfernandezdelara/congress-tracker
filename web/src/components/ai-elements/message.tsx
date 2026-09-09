import type { HTMLAttributes } from 'react'
import type { UIMessage } from 'ai'

import { cn } from '@/lib/utils'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage['role']
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        'bill-chat-message',
        from === 'user' && 'bill-chat-message--user',
        from === 'assistant' && 'bill-chat-message--assistant',
        className,
      )}
      data-from={from}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export function MessageContent({ className, ...props }: MessageContentProps) {
  return <div className={cn('bill-chat-message-content', className)} {...props} />
}
