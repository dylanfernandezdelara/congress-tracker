import { Input as BaseInput } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  [
    "h-control w-full min-w-0 text-ui text-fg transition-interactive duration-fast ease-out placeholder:text-fg-tertiary",
    "data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:outline-2 aria-invalid:outline-danger",
  ],
  {
    variants: {
      variant: {
        /** A bordered field. */
        box: "rounded-sm bg-page px-2.5 hairline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus",
        /** A bare line under the text, for dense toolbars; the line darkens on focus. */
        underline: "rounded-none bg-transparent px-0 hairline-b focus:hairline-b-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      },
    },
    defaultVariants: { variant: "box" },
  },
)

function Input({ className, variant, ...props }: ComponentProps<typeof BaseInput> & VariantProps<typeof inputVariants>) {
  return <BaseInput data-slot="input" className={cn(inputVariants({ variant }), className)} {...props} />
}

export { Input, inputVariants }
