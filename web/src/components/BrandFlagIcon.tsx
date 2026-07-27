type BrandFlagIconProps = {
  className?: string
}

/** Five-point star centered at origin, radius 1 — scaled/translated per star. */
const STAR_PATH =
  'M0,-1 0.2245,-0.309 0.9511,-0.309 0.3633,0.118 0.5878,0.809 0,0.382 -0.5878,0.809 -0.3633,0.118 -0.9511,-0.309 -0.2245,-0.309Z'

function buildStarCenters(cantonW: number, cantonH: number): Array<{ cx: number; cy: number }> {
  const stars: Array<{ cx: number; cy: number }> = []
  const hGap = cantonW / 12
  const vGap = cantonH / 10
  for (let row = 0; row < 9; row += 1) {
    const count = row % 2 === 0 ? 6 : 5
    const startCol = row % 2 === 0 ? 0 : 1
    for (let i = 0; i < count; i += 1) {
      const col = startCol + i * 2
      stars.push({
        cx: hGap * (col + 1),
        cy: vGap * (row + 1),
      })
    }
  }
  return stars
}

/**
 * High-resolution US flag brand mark for the site header.
 * Separate from the favicon assets (web/public/favicon.svg + generate:favicons),
 * which use a simplified geometry tuned for tiny tab / touch icons.
 */
export function BrandFlagIcon({ className = '' }: BrandFlagIconProps) {
  const cantonW = 76
  const cantonH = (7 / 13) * 100
  const stars = buildStarCenters(cantonW, cantonH)

  return (
    <svg
      className={`brand-flag-icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 190 100"
      width="28"
      height="15"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="190" height="100" fill="#B22234" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={`stripe-${i}`}
          y={((2 * i + 1) * 100) / 13}
          width="190"
          height={100 / 13}
          fill="#FFFFFF"
        />
      ))}
      <rect width={cantonW} height={cantonH} fill="#3C3B6E" />
      {stars.map((star, i) => (
        <path
          key={`star-${i}`}
          d={STAR_PATH}
          fill="#FFFFFF"
          transform={`translate(${star.cx} ${star.cy}) scale(3.1)`}
        />
      ))}
    </svg>
  )
}
