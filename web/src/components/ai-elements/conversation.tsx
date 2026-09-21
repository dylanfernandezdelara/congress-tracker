import { cn } from "@/lib/utils"
import type { ComponentProps, ReactNode } from "react"
import { StickToBottom } from "use-stick-to-bottom"

/**
 * Stick-to-bottom log from Vercel AI Elements Conversation.
 * Unused registry extras (download / jump-to-latest) are omitted.
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

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string
  description?: string
  icon?: ReactNode
}

export function ConversationEmptyState({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <div className="space-y-1">
            <h3 className="font-medium text-sm">{title}</h3>
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
        </>
      )}
    </div>
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
