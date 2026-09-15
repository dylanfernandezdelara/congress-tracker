"use client"

import { cn } from "@/lib/utils"
import type { UIMessage } from "ai"
import type { HTMLAttributes } from "react"

/**
 * Layout primitives from Vercel AI Elements Message, without Streamdown.
 * Bill answers render verified quotes as custom figures, not markdown.
 */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full max-w-[95%] flex-col gap-2",
        from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
        className,
      )}
      data-from={from}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
        "group-[.is-user]:ml-auto",
        className,
      )}
      {...props}
    />
  )
}
