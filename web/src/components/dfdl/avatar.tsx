"use client"

import { Avatar as BaseAvatar } from "@base-ui/react/avatar"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const avatarVariants = cva("relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-active align-middle select-none", {
  variants: { size: { sm: "size-6 text-caption", md: "size-8 text-ui", lg: "size-10 text-ui" } },
  defaultVariants: { size: "md" },
})

/** Image with an initials fallback that shows while the image loads or if it fails. */
function Avatar({ src, alt, fallback, size, className, ...props }: ComponentProps<typeof BaseAvatar.Root> & VariantProps<typeof avatarVariants> & { src?: string; alt: string; fallback: string }) {
  return (
    <BaseAvatar.Root data-slot="avatar" className={cn(avatarVariants({ size }), className)} {...props}>
      <BaseAvatar.Fallback className="flex size-full items-center justify-center font-medium text-fg-secondary">{fallback}</BaseAvatar.Fallback>
      {src ? <BaseAvatar.Image src={src} alt={alt} className="absolute inset-0 size-full object-cover" /> : null}
    </BaseAvatar.Root>
  )
}

export { Avatar, avatarVariants }
