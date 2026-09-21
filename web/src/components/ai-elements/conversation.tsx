import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"
import { StickToBottom } from "use-stick-to-bottom"

/**
 * Stick-to-bottom log from Vercel AI Elements Conversation.
 * Unused registry extras (download / empty / jump-to-latest) are omitted;
 * the bill chat renders its own empty slot so snap-aware CSS owns it.
 */
export type ConversationProps = ComponentProps<typeof StickToBottom>

export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={cn("relative flex-1 overflow-y-hidden", className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  )
}

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>

export function ConversationContent({
  className,
  scrollClassName,
  ...props
}: ConversationContentProps) {
  return (
    <StickToBottom.Content
      className={cn("flex flex-col", className)}
      scrollClassName={scrollClassName}
      {...props}
    />
  )
}
