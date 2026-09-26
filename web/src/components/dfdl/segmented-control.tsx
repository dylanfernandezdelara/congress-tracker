"use client"

import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { createContext, useContext, type ComponentProps } from "react"

import { cn } from "@/lib/utils"

type Variant = "pill" | "underline"

const VariantContext = createContext<Variant>("pill")

/**
 * One choice from a few, shown all at once: a radio group, so screen readers hear "1 of 3", arrow keys move the
 * choice and the group is one Tab stop. `pill` (default) sits in a sunken track; `underline` is a bare row with a
 * line under the choice, for dense toolbars.
 */
function SegmentedControl({
  className,
  onValueChange,
  variant = "pill",
  ...props
}: Omit<ComponentProps<typeof RadioGroup>, "onValueChange"> & {
  onValueChange?: (value: string) => void
  variant?: Variant
}) {
  return (
    <VariantContext.Provider value={variant}>
      <RadioGroup
        data-slot="segmented-control"
        data-variant={variant}
        onValueChange={(v) => onValueChange?.(v as string)}
        className={cn(
          variant === "pill" && "inline-flex h-control items-center gap-0.5 rounded-sm bg-sunken p-0.5 hairline",
          variant === "underline" && "inline-flex h-control items-stretch hairline-b",
          className,
        )}
        {...props}
      />
    </VariantContext.Provider>
  )
}

function SegmentedControlItem({ className, ...props }: ComponentProps<typeof Radio.Root>) {
  const variant = useContext(VariantContext)
  return (
    <Radio.Root
      data-slot="segmented-control-item"
      className={cn(
        "inline-flex cursor-default items-center gap-1.5 text-ui transition-interactive duration-fast ease-out select-none [&_svg]:size-4",
        "data-disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        variant === "pill" &&
          "h-7 rounded-xs px-2.5 text-fg-secondary hover:text-fg-strong data-checked:bg-surface data-checked:text-fg-strong data-checked:elevation-raised",
        variant === "underline" &&
          "px-3 text-fg-tertiary hover:text-fg-secondary data-checked:font-medium data-checked:text-fg-strong data-checked:hairline-b-strong",
        className,
      )}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem }
