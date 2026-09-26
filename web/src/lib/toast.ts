import { createToastManager } from '@/components/dfdl/toast'

/** The app's toasts. AppLayout renders them; anything can add one, including components rendered alone in tests. */
export const toastManager = createToastManager()

/** Short status line, like "Shared quote". */
export function notify(title: string) {
  toastManager.add({ title })
}
