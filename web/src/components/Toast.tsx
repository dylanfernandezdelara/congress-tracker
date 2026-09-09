import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type ToastProps = {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

/** Bottom-center transient status pill; auto-dismisses. */
export function Toast({ message, onDismiss, durationMs = 2800 }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(timer)
  }, [message, onDismiss, durationMs])

  if (!message || typeof document === 'undefined') return null
  return createPortal(
    <p className="app-toast" role="status">
      {message}
    </p>,
    document.body,
  )
}
