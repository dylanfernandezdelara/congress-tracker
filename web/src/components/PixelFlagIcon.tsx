type PixelFlagIconProps = {
  className?: string
}

/** Small 8-bit style US flag for the site brand mark.
 *  Keep geometry in sync with web/public/favicon.svg; run npm run generate:favicons for PNGs. */
export function PixelFlagIcon({ className = '' }: PixelFlagIconProps) {
  return (
    <svg
      className={`pixel-flag-icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 19 13"
      width="22"
      height="15"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect width="19" height="13" fill="#B22234" />
      <rect y="1" width="19" height="1" fill="#FFFFFF" />
      <rect y="3" width="19" height="1" fill="#FFFFFF" />
      <rect y="5" width="19" height="1" fill="#FFFFFF" />
      <rect y="7" width="19" height="1" fill="#FFFFFF" />
      <rect y="9" width="19" height="1" fill="#FFFFFF" />
      <rect y="11" width="19" height="1" fill="#FFFFFF" />
      <rect width="8" height="7" fill="#3C3B6E" />
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" />
      <rect x="3" y="1" width="1" height="1" fill="#FFFFFF" />
      <rect x="5" y="1" width="1" height="1" fill="#FFFFFF" />
      <rect x="2" y="2" width="1" height="1" fill="#FFFFFF" />
      <rect x="4" y="2" width="1" height="1" fill="#FFFFFF" />
      <rect x="6" y="2" width="1" height="1" fill="#FFFFFF" />
      <rect x="1" y="3" width="1" height="1" fill="#FFFFFF" />
      <rect x="3" y="3" width="1" height="1" fill="#FFFFFF" />
      <rect x="5" y="3" width="1" height="1" fill="#FFFFFF" />
      <rect x="2" y="4" width="1" height="1" fill="#FFFFFF" />
      <rect x="4" y="4" width="1" height="1" fill="#FFFFFF" />
      <rect x="6" y="4" width="1" height="1" fill="#FFFFFF" />
      <rect x="1" y="5" width="1" height="1" fill="#FFFFFF" />
      <rect x="3" y="5" width="1" height="1" fill="#FFFFFF" />
      <rect x="5" y="5" width="1" height="1" fill="#FFFFFF" />
    </svg>
  )
}
