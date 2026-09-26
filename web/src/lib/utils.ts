import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
  Class merging that knows the dfdl vocabulary (src/dfdl/theme.css), so a custom role such as text-ui is not
  dropped by a later text-fg, and dfdl elevation, motion and hairline utilities merge by group.
*/
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["headline", "display", "title", "heading", "body", "reading", "ui", "caption"] }],
      "font-family": [{ font: ["display", "heading"] }],
      shadow: ["elevation-raised", "elevation-floating", "hairline", "hairline-t", "hairline-b", "hairline-r", "hairline-l"],
      w: ["w-anchor"],
      transition: [
        "transition-interactive",
        "transition-icon",
        "motion-pop",
        "motion-tooltip",
        "motion-dialog",
        "motion-fade",
        "motion-reveal",
        "sheet-popup",
        "sheet-backdrop",
        "toast-root",
        "toast-content",
      ],
      duration: ["duration-instant", "duration-fast", "duration-normal", "duration-slow", "duration-slower"],
      ease: [{ ease: ["spring", "drawer"] }],
      blur: [{ blur: ["icon"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
