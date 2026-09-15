import { cn } from "@/lib/utils"
import type { UIMessage } from "ai"
import type { HTMLAttributes } from "react"

/**
 * Role wrappers from Vercel AI Elements Message, without Streamdown.
 * Bubble paint and max-width live in bill-chat.css.
 */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(from === "user" ? "is-user" : "is-assistant", className)}
      data-from={from}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export function MessageContent({ className, ...props }: MessageContentProps) {
  return <div className={className} {...props} />
}
