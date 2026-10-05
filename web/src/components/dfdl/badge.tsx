import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex h-6 items-center gap-1 rounded-full px-2 text-caption whitespace-nowrap [&_svg]:size-3", {
  variants: {
    variant: {
      neutral: "bg-surface-active text-fg-secondary",
      accent: "bg-accent-bg text-accent-text",
      success: "bg-success-bg text-success-text",
      warning: "bg-warning-bg text-warning-text",
      danger: "bg-danger-bg text-danger-text",
    },
  },
  defaultVariants: { variant: "neutral" },
})

function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
