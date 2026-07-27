type BrandFlagIconProps = {
  className?: string
}

/** Five-point star centered at origin, radius 1 — scaled/translated per star. */
const STAR_PATH =
  'M0,-1 0.2245,-0.309 0.9511,-0.309 0.3633,0.118 0.5878,0.809 0,0.382 -0.5878,0.809 -0.3633,0.118 -0.9511,-0.309 -0.2245,-0.309Z'

const FLAG_W = 190
const FLAG_H = 100
const CANTON_W = 76
const CANTON_H = (7 / 13) * FLAG_H
const STAR_SCALE = 3.1

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

const STAR_CENTERS = buildStarCenters(CANTON_W, CANTON_H)

/**
 * High-resolution US flag brand mark for the site header.
 * Separate from the favicon assets (web/public/favicon.svg + generate:favicons),
 * which use a simplified geometry tuned for tiny tab / touch icons.
 */
export function BrandFlagIcon({ className = '' }: BrandFlagIconProps) {
  return (
    <svg
      className={`brand-flag-icon${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${FLAG_W} ${FLAG_H}`}
      width="28"
      height={Number(((28 * FLAG_H) / FLAG_W).toFixed(2))}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={FLAG_W} height={FLAG_H} fill="#B22234" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={`stripe-${i}`}
          y={((2 * i + 1) * FLAG_H) / 13}
          width={FLAG_W}
          height={FLAG_H / 13}
          fill="#FFFFFF"
        />
      ))}
      <rect width={CANTON_W} height={CANTON_H} fill="#3C3B6E" />
      {STAR_CENTERS.map((star, i) => (
        <path
          key={`star-${i}`}
          d={STAR_PATH}
          fill="#FFFFFF"
          fillRule="evenodd"
          transform={`translate(${star.cx} ${star.cy}) scale(${STAR_SCALE})`}
        />
      ))}
    </svg>
  )
}
