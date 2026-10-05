import { Button as BaseButton } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm text-ui font-medium whitespace-nowrap transition-interactive duration-fast ease-out press select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent-solid text-fg-on-accent hover:bg-accent-solid-hover",
        secondary: "bg-surface text-fg-strong elevation-raised hover:bg-surface-hover",
        ghost: "text-fg-secondary hover:bg-surface-hover hover:text-fg-strong",
        danger: "bg-danger text-fg-on-accent hover:opacity-90",
      },
      size: {
        sm: "h-7 px-2.5",
        md: "h-control px-3",
        lg: "h-10 px-4",
        icon: "size-control",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
)

function Button({ className, variant, size, ...props }: ComponentProps<typeof BaseButton> & VariantProps<typeof buttonVariants>) {
  return <BaseButton data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
