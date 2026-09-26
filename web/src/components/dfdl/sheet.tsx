"use client"

import { Drawer } from "@base-ui/react/drawer"
import { useEffect, useState, type ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Base UI skips the enter transition for a drawer that mounts already open (a sheet rendered when a selection is
 * made). A controlled Sheet therefore renders closed for its first frame, then open, so it always slides in.
 * Opened from code rather than a SheetTrigger? Pass `finalFocus` on SheetContent so closing returns focus.
 */
function Sheet({ open, ...props }: ComponentProps<typeof Drawer.Root>) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return <Drawer.Root open={open === undefined ? undefined : open && mounted} {...props} />
}
const SheetTrigger = Drawer.Trigger
const SheetClose = Drawer.Close

/**
 * Sheet: docked to the bottom on phones, a centered floating panel from 640px. Slides up on the drawer curve, swipe
 * down to dismiss, stacks when nested, traps focus and locks scroll. Capped at 32rem wide.
 */
function SheetContent({ className, children, ...props }: ComponentProps<typeof Drawer.Popup>) {
  return (
    <Drawer.Portal>
      <Drawer.Backdrop className="sheet-backdrop fixed inset-0 z-50 bg-overlay" />
      <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-major">
        <Drawer.Popup
          data-slot="sheet"
          className={cn(
            "sheet-popup flex w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-t-xl bg-raised px-major pt-minor pb-major elevation-floating outline-none sm:rounded-xl",
            className,
          )}
          {...props}
        >
          <div aria-hidden className="mx-auto mb-minor h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />
          <Drawer.Content className="flex flex-col gap-major">{children}</Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  )
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function SheetTitle({ className, ...props }: ComponentProps<typeof Drawer.Title>) {
  return <Drawer.Title data-slot="sheet-title" className={cn("font-heading text-heading text-fg-strong", className)} {...props} />
}

function SheetDescription({ className, ...props }: ComponentProps<typeof Drawer.Description>) {
  return <Drawer.Description data-slot="sheet-description" className={cn("text-ui text-fg-secondary", className)} {...props} />
}

function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("flex justify-end gap-minor", className)} {...props} />
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger }
