"use client"

import { Toast as BaseToast } from "@base-ui/react/toast"
import { X } from "lucide-react"
import type { ReactNode } from "react"

type ToasterVariant = "card" | "pill"

/**
 * Toasts. Put <Toaster> once near the root; call useToast().add({ title, description }) anywhere under it.
 * card (default): title, description and a close button; bottom right on wide screens, bottom center on narrow
 * ones; swipe right or down. pill: one short line (the title), bottom center, swipe down; for a status that needs
 * no action, like "Link copied". F6 reaches either by keyboard.
 * To add toasts from outside React, or from components rendered without the Toaster (isolated tests), pass a
 * manager from createToastManager() and call its add() directly.
 */
function Toaster({
  children,
  limit = 3,
  timeout = 5000,
  variant = "card",
  toastManager,
}: {
  children?: ReactNode
  limit?: number
  timeout?: number
  variant?: ToasterVariant
  toastManager?: ReturnType<typeof BaseToast.createToastManager>
}) {
  return (
    <BaseToast.Provider limit={limit} timeout={timeout} toastManager={toastManager}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport
          className={
            variant === "pill"
              ? "fixed right-4 bottom-major left-4 z-50"
              : "fixed right-4 bottom-4 left-4 z-50 sm:right-major sm:bottom-major sm:left-auto sm:w-toast"
          }
        >
          {variant === "pill" ? <PillList /> : <ToastList />}
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  )
}

function PillList() {
  const { toasts } = BaseToast.useToastManager()
  return toasts.map((toast) => (
    <BaseToast.Root key={toast.id} toast={toast} swipeDirection="down" data-slot="toast" data-variant="pill" className="toast-root rounded-full bg-raised elevation-floating outline-none">
      <BaseToast.Content className="toast-content flex h-control items-center px-3">
        <BaseToast.Title className="text-caption font-medium text-fg-strong" />
      </BaseToast.Content>
    </BaseToast.Root>
  ))
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager()
  return toasts.map((toast) => (
    <BaseToast.Root key={toast.id} toast={toast} swipeDirection={["right", "down"]} data-slot="toast" className="toast-root rounded-md bg-raised elevation-floating outline-none">
      <BaseToast.Content className="toast-content flex items-start gap-minor p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <BaseToast.Title className="text-ui font-medium text-fg-strong" />
          <BaseToast.Description className="text-ui text-fg-secondary" />
        </div>
        <BaseToast.Close aria-label="Dismiss" className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-fg-tertiary transition-interactive duration-fast ease-out hover:bg-surface-hover hover:text-fg-strong">
          <X className="size-4" strokeWidth={1.5} aria-hidden />
        </BaseToast.Close>
      </BaseToast.Content>
    </BaseToast.Root>
  ))
}

const useToast = BaseToast.useToastManager
const createToastManager = BaseToast.createToastManager

export { Toaster, createToastManager, useToast }
