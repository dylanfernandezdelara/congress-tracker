"use client"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import type { ChatStatus } from "ai"
import { SquareIcon } from "lucide-react"
import { forwardRef } from "react"
import type {
  ComponentProps,
  FormEvent,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
} from "react"

/**
 * Text-only subset of Vercel AI Elements PromptInput (no file drop, screenshot,
 * or model picker). Same names and submit shape as the registry component.
 */
export type PromptInputMessage = {
  text: string
}

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void | Promise<void>
}

export function PromptInput({ className, onSubmit, children, ...props }: PromptInputProps) {
  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get("message") ?? "")
    void onSubmit({ text }, event)
  }

  return (
    <form className={cn("w-full", className)} onSubmit={handleSubmit} {...props}>
      <InputGroup className="bill-chat-prompt-group items-stretch">{children}</InputGroup>
    </form>
  )
}

export function PromptInputHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <InputGroupAddon align="block-start" className={cn("w-full", className)} {...props} />
  )
}

export function PromptInputBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 flex-1", className)} {...props} />
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>

export const PromptInputTextarea = forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  function PromptInputTextarea({ onKeyDown, className, ...props }, ref) {
    const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
      onKeyDown?.(event)
      if (event.defaultPrevented) return
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }

    return (
      <InputGroupTextarea
        ref={ref}
        name="message"
        className={cn("min-h-12 max-h-36 field-sizing-content", className)}
        onKeyDown={handleKeyDown}
        {...props}
      />
    )
  },
)

export function PromptInputFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <InputGroupAddon align="block-end" className={cn("justify-end", className)} {...props} />
  )
}

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus
  onStop?: () => void
}

export function PromptInputSubmit({
  status,
  onStop,
  className,
  disabled,
  ...props
}: PromptInputSubmitProps) {
  const stopping = status === "submitted" || status === "streaming"

  return (
    <InputGroupButton
      type={stopping ? "button" : "submit"}
      variant="default"
      size="sm"
      aria-label={stopping ? "Stop" : "Send"}
      disabled={stopping ? false : disabled}
      onClick={stopping ? onStop : undefined}
      className={className}
      {...props}
    >
      {stopping ? <SquareIcon /> : "Send"}
    </InputGroupButton>
  )
}
