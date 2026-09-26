import { Separator as BaseSeparator } from "@base-ui/react/separator"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** A 1px rule. Horizontal by default; data-orientation="vertical" stands it up inside a row. */
function Separator({ className, orientation = "horizontal", ...props }: ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      data-slot="separator"
      orientation={orientation}
      className={cn("shrink-0 bg-separator", orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch", className)}
      {...props}
    />
  )
}

export { Separator }
