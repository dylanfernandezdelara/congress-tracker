import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  type FormEvent,
  type HTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PromptInputContextValue = {
  disabled: boolean
}

const PromptInputContext = createContext<PromptInputContextValue>({ disabled: false })

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  disabled?: boolean
}

export function PromptInput({
  className,
  onSubmit,
  disabled = false,
  children,
  ...props
}: PromptInputProps) {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (disabled) return
      onSubmit?.(event)
    },
    [disabled, onSubmit],
  )

  return (
    <PromptInputContext.Provider value={{ disabled }}>
      <form className={cn('bill-chat-prompt', className)} onSubmit={handleSubmit} {...props}>
        {children}
      </form>
    </PromptInputContext.Provider>
  )
}

export type PromptInputTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const PromptInputTextarea = forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  function PromptInputTextarea({ className, onKeyDown, disabled, ...props }, ref) {
    const ctx = useContext(PromptInputContext)
    return (
      <textarea
        ref={ref}
        className={cn('bill-chat-prompt-textarea', className)}
        disabled={disabled ?? ctx.disabled}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented) return
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
        rows={2}
        {...props}
      />
    )
  },
)

export type PromptInputFooterProps = HTMLAttributes<HTMLDivElement>

export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return <div className={cn('bill-chat-prompt-footer', className)} {...props} />
}

export type PromptInputSubmitProps = ButtonProps

export function PromptInputSubmit({
  className,
  children = 'Send',
  disabled,
  ...props
}: PromptInputSubmitProps) {
  const ctx = useContext(PromptInputContext)
  return (
    <Button
      className={cn('bill-chat-prompt-submit', className)}
      disabled={disabled ?? ctx.disabled}
      size="sm"
      type="submit"
      variant="default"
      {...props}
    >
      {children}
    </Button>
  )
}
