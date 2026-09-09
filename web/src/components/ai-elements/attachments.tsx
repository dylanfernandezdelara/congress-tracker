import { FileTextIcon, XIcon } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
} from 'react'

import { cn } from '@/lib/utils'

type AttachmentContextValue = {
  label: string
  title: string
  onRemove?: () => void
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null)

function useAttachmentContext(): AttachmentContextValue {
  const ctx = useContext(AttachmentContext)
  if (!ctx) {
    throw new Error('Attachment components must be used within Attachment')
  }
  return ctx
}

export type AttachmentsProps = HTMLAttributes<HTMLDivElement>

export function Attachments({ className, ...props }: AttachmentsProps) {
  return <div className={cn('bill-chat-attachments', className)} {...props} />
}

export type AttachmentProps = HTMLAttributes<HTMLDivElement> & {
  label: string
  title?: string
  onRemove?: () => void
}

export function Attachment({
  label,
  title,
  onRemove,
  className,
  children,
  ...props
}: AttachmentProps) {
  const contextValue = useMemo(
    () => ({ label, title: title ?? label, onRemove }),
    [label, onRemove, title],
  )

  return (
    <AttachmentContext.Provider value={contextValue}>
      <div className={cn('bill-chat-attachment', className)} title={title ?? label} {...props}>
        {children}
      </div>
    </AttachmentContext.Provider>
  )
}

export type AttachmentPreviewProps = HTMLAttributes<HTMLSpanElement>

export function AttachmentPreview({ className, ...props }: AttachmentPreviewProps) {
  return (
    <span className={cn('bill-chat-attachment-icon', className)} aria-hidden {...props}>
      <FileTextIcon />
    </span>
  )
}

export type AttachmentInfoProps = HTMLAttributes<HTMLSpanElement>

export function AttachmentInfo({ className, ...props }: AttachmentInfoProps) {
  const { label, title } = useAttachmentContext()
  return (
    <span className={cn('bill-chat-attachment-label', className)} title={title} {...props}>
      {label}
    </span>
  )
}

export type AttachmentRemoveProps = ButtonHTMLAttributes<HTMLButtonElement>

export function AttachmentRemove({
  className,
  onClick,
  children,
  ...props
}: AttachmentRemoveProps) {
  const { onRemove } = useAttachmentContext()
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onClick?.(event)
      onRemove?.()
    },
    [onClick, onRemove],
  )

  if (!onRemove) return null

  return (
    <button
      type="button"
      className={cn('bill-chat-attachment-remove', className)}
      aria-label="Remove"
      onClick={handleClick}
      {...props}
    >
      {children ?? <XIcon />}
    </button>
  )
}
