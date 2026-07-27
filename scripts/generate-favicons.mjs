/**
 * Antialiased rasterizer for Track Congress favicon PNGs.
 *
 * Favicon geometry (tab / touch icons) is defined here and mirrored in
 * web/public/favicon.svg. The in-app header mark is a separate high-detail
 * vector: web/src/components/BrandFlagIcon.tsx — do not force those to match.
 *
 * Usage: npm run generate:favicons
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(repoRoot, 'web', 'public')

/** @type {readonly [number, number, number]} */
const RED = [178, 34, 52]
/** @type {readonly [number, number, number]} */
const WHITE = [255, 255, 255]
/** @type {readonly [number, number, number]} */
const BLUE = [60, 59, 110]

/** Logical favicon canvas (matches favicon.svg viewBox). */
export const FAVICON_VIEWBOX = 32
const FLAG_X = 1
const FLAG_Y = 7.5
const FLAG_W = 30
const FLAG_H = 17
const STRIPE_H = FLAG_H / 13
const CANTON_W = 12
const CANTON_H = (7 / 13) * FLAG_H
/** Outer radius of each favicon star in viewBox units. */
const STAR_R = 0.95
/** @type {ReadonlyArray<readonly [number, number]>} */
const STAR_CENTERS = [
  [3.5, 9.3],
  [7, 9.3],
  [10.5, 9.3],
  [3.5, 12.05],
  [7, 12.05],
  [10.5, 12.05],
  [3.5, 14.8],
  [7, 14.8],
  [10.5, 14.8],
]

/** @type {ReadonlyArray<readonly [number, number]>} */
const STAR_VERTICES = [
  [0, -1],
  [0.2245, -0.309],
  [0.9511, -0.309],
  [0.3633, 0.118],
  [0.5878, 0.809],
  [0, 0.382],
  [-0.5878, 0.809],
  [-0.3633, 0.118],
  [-0.9511, -0.309],
  [-0.2245, -0.309],
]

/** Unit five-point star path derived from STAR_VERTICES (evenodd fill). */
const STAR_PATH = `M${STAR_VERTICES.map(([x, y]) => `${x},${y}`).join(' ')}Z`

/**
 * @param {number} px
 * @param {number} py
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 */
function pointInStar(px, py, cx, cy, radius) {
  const x = (px - cx) / radius
  const y = (py - cy) / radius
  // Quick reject outside circumcircle.
  if (x * x + y * y > 1.05) return false
  let inside = false
  for (let i = 0, j = STAR_VERTICES.length - 1; i < STAR_VERTICES.length; j = i, i += 1) {
    const xi = STAR_VERTICES[i][0]
    const yi = STAR_VERTICES[i][1]
    const xj = STAR_VERTICES[j][0]
    const yj = STAR_VERTICES[j][1]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

const FAVICON_SIZE = 32
const APPLE_SIZE = 180
const SUPERSAMPLE = 4

/**
 * Sample the favicon flag at a point in viewBox coordinates.
 * @param {number} x
 * @param {number} y
 * @returns {readonly [number, number, number] | null}
 */
export function sampleFaviconColor(x, y) {
  if (x < FLAG_X || y < FLAG_Y || x >= FLAG_X + FLAG_W || y >= FLAG_Y + FLAG_H) {
    return null
  }

  const localX = x - FLAG_X
  const localY = y - FLAG_Y

  if (localX < CANTON_W && localY < CANTON_H) {
    for (const [cx, cy] of STAR_CENTERS) {
      if (pointInStar(x, y, cx, cy, STAR_R)) return WHITE
    }
    return BLUE
  }

  const stripeIndex = Math.min(12, Math.floor(localY / STRIPE_H))
  return stripeIndex % 2 === 0 ? RED : WHITE
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Array<readonly [number, number, number, number]>} pixels
 */
function writePng(width, height, pixels) {
  const bpp = 4
  const raw = Buffer.alloc((1 + width * bpp) * height)
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < width; x += 1) {
      const pixel = pixels[y * width + x]
      raw[offset] = pixel[0]
      raw[offset + 1] = pixel[1]
      raw[offset + 2] = pixel[2]
      raw[offset + 3] = pixel[3]
      offset += bpp
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(6, 9)
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12)

  /** @param {Buffer} tag @param {Buffer} data */
  function chunk(tag, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(
      zlib.crc32(Buffer.concat([tag, data])) >>> 0,
      0,
    )
    return Buffer.concat([len, tag, data, crc])
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk(Buffer.from('IHDR'), ihdr),
    chunk(Buffer.from('IDAT'), zlib.deflateSync(raw, { level: 9 })),
    chunk(Buffer.from('IEND'), Buffer.alloc(0)),
  ])
}

/**
 * @param {number} size
 * @param {number} [samples]
 */
export function renderFaviconPng(size = FAVICON_SIZE, samples = SUPERSAMPLE) {
  /** @type {Array<readonly [number, number, number, number]>} */
  const pixels = []
  const scale = FAVICON_VIEWBOX / size

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let opaque = 0
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const vx = (x + (sx + 0.5) / samples) * scale
          const vy = (y + (sy + 0.5) / samples) * scale
          const color = sampleFaviconColor(vx, vy)
          if (!color) continue
          r += color[0]
          g += color[1]
          b += color[2]
          opaque += 1
        }
      }
      const n = samples * samples
      if (opaque === 0) {
        pixels.push([0, 0, 0, 0])
        continue
      }
      pixels.push([
        Math.round(r / opaque),
        Math.round(g / opaque),
        Math.round(b / opaque),
        Math.round((opaque / n) * 255),
      ])
    }
  }

  return writePng(size, size, pixels)
}

export function renderFavicon32() {
  return renderFaviconPng(FAVICON_SIZE)
}

export function renderAppleTouchIcon() {
  return renderFaviconPng(APPLE_SIZE)
}

/** SVG markup matching sampleFaviconColor geometry (for sync checks / rewrite). */
export function renderFaviconSvg() {
  const whiteStripes = [1, 3, 5, 7, 9, 11]
    .map((i) => {
      const y = FLAG_Y + i * STRIPE_H
      return `  <rect x="${FLAG_X}" y="${y}" width="${FLAG_W}" height="${STRIPE_H}" fill="#FFFFFF"/>`
    })
    .join('\n')
  const stars = STAR_CENTERS.map(
    ([cx, cy]) =>
      `  <path d="${STAR_PATH}" fill="#FFFFFF" fill-rule="evenodd" transform="translate(${cx} ${cy}) scale(${STAR_R})"/>`,
  ).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FAVICON_VIEWBOX} ${FAVICON_VIEWBOX}" role="img" aria-label="Track Congress">
  <!-- Favicon-optimized flag (simplified stars, square canvas).
       Separate from web/src/components/BrandFlagIcon.tsx (header logo).
       Keep geometry in sync with scripts/generate-favicons.mjs; run npm run generate:favicons. -->
  <rect x="${FLAG_X}" y="${FLAG_Y}" width="${FLAG_W}" height="${FLAG_H}" fill="#B22234"/>
${whiteStripes}
  <rect x="${FLAG_X}" y="${FLAG_Y}" width="${CANTON_W}" height="${CANTON_H}" fill="#3C3B6E"/>
${stars}
</svg>
`
}

export function generateFavicons({ outDir = publicDir } = {}) {
  const favicon32 = renderFavicon32()
  const appleTouch = renderAppleTouchIcon()
  const faviconSvg = renderFaviconSvg()
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'favicon-32x32.png'), favicon32)
  fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), appleTouch)
  fs.writeFileSync(path.join(outDir, 'favicon.svg'), faviconSvg)
  return {
    favicon32Path: path.join(outDir, 'favicon-32x32.png'),
    appleTouchPath: path.join(outDir, 'apple-touch-icon.png'),
    faviconSvgPath: path.join(outDir, 'favicon.svg'),
    favicon32Sha256: createHash('sha256').update(favicon32).digest('hex'),
    appleTouchSha256: createHash('sha256').update(appleTouch).digest('hex'),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = generateFavicons()
  console.log(`Wrote ${result.favicon32Path}`)
  console.log(`Wrote ${result.appleTouchPath}`)
  console.log(`Wrote ${result.faviconSvgPath}`)
}
