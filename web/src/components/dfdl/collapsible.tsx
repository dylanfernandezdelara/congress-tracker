"use client"

import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible"
import { ChevronRight } from "lucide-react"
import { useCallback, useState, type ComponentProps } from "react"

import { cn } from "@/lib/utils"

const Collapsible = BaseCollapsible.Root

/** Trigger with a chevron that turns when open. Pass children for the label. */
function CollapsibleTrigger({ className, children, ...props }: ComponentProps<typeof BaseCollapsible.Trigger>) {
  return (
    <BaseCollapsible.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "group inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-ui text-fg-secondary transition-interactive duration-fast ease-out hover:bg-surface-hover hover:text-fg-strong",
        className,
      )}
      {...props}
    >
      <ChevronRight className="size-4 transition-icon duration-fast ease-out group-data-panel-open:rotate-90" strokeWidth={1.5} aria-hidden />
      {children}
    </BaseCollapsible.Trigger>
  )
}

/**
 * By default the panel opens at once and its content fades in: right for rows in a list, where the list itself
 * should not slide. `expand` animates the height as well, for a panel that pushes the page down (a filter panel
 * under a toolbar). It clips only while the height moves, so a popup inside the open panel is not cut off.
 */
function CollapsibleContent({ className, expand = false, ...props }: ComponentProps<typeof BaseCollapsible.Panel> & { expand?: boolean }) {
  const [moving, setMoving] = useState(false)
  // The panel unmounts when closed, so listen from a ref callback: it attaches each time the panel mounts.
  const watchHeight = useCallback(
    (el: HTMLDivElement | null) => {
      if (!expand || !el) return
      const onHeight = (next: boolean) => (e: TransitionEvent) => {
        if (e.target === el && e.propertyName === "height") setMoving(next)
      }
      const start = onHeight(true)
      const stop = onHeight(false)
      el.addEventListener("transitionrun", start)
      el.addEventListener("transitionend", stop)
      el.addEventListener("transitioncancel", stop)
      return () => {
        el.removeEventListener("transitionrun", start)
        el.removeEventListener("transitionend", stop)
        el.removeEventListener("transitioncancel", stop)
        setMoving(false)
      }
    },
    [expand],
  )
  return (
    <BaseCollapsible.Panel
      ref={watchHeight}
      data-slot="collapsible-content"
      data-moving={moving || undefined}
      className={cn(expand ? "motion-expand" : "motion-reveal", className)}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
