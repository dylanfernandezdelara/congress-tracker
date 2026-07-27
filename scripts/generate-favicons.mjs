/**
 * Nearest-neighbor rasterizer for Track Congress favicon PNGs.
 *
 * Canonical geometry lives in web/public/favicon.svg (flag group) and
 * web/src/components/PixelFlagIcon.tsx (in-app header). Keep all three in sync
 * when editing the pixel flag.
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

const FLAG_W = 19
const FLAG_H = 13
const WHITE_ROWS = new Set([1, 3, 5, 7, 9, 11])
const STARS = new Set([
  '1,1', '3,1', '5,1',
  '2,2', '4,2', '6,2',
  '1,3', '3,3', '5,3',
  '2,4', '4,4', '6,4',
  '1,5', '3,5', '5,5',
])

export const FLAG_WIDTH = FLAG_W
export const FLAG_HEIGHT = FLAG_H
const FAVICON_SIZE = 32
const FAVICON_FLAG_OX = Math.floor((FAVICON_SIZE - FLAG_W) / 2)
const FAVICON_FLAG_OY = Math.floor((FAVICON_SIZE - FLAG_H) / 2)

/** Apple touch: 180×180 transparent canvas, flag scaled ×8 and centered. */
const APPLE_SIZE = 180
const APPLE_FLAG_SCALE = 8

/**
 * @param {number} fx
 * @param {number} fy
 * @returns {readonly [number, number, number] | null}
 */
export function flagColor(fx, fy) {
  if (fx < 0 || fy < 0 || fx >= FLAG_W || fy >= FLAG_H) return null
  if (fx < 8 && fy < 7) {
    return STARS.has(`${fx},${fy}`) ? WHITE : BLUE
  }
  return WHITE_ROWS.has(fy) ? WHITE : RED
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

export function renderFavicon32() {
  /** @type {Array<readonly [number, number, number, number]>} */
  const pixels = []
  for (let y = 0; y < FAVICON_SIZE; y += 1) {
    for (let x = 0; x < FAVICON_SIZE; x += 1) {
      const color = flagColor(x - FAVICON_FLAG_OX, y - FAVICON_FLAG_OY)
      if (!color) {
        pixels.push([0, 0, 0, 0])
        continue
      }
      pixels.push([color[0], color[1], color[2], 255])
    }
  }
  return writePng(FAVICON_SIZE, FAVICON_SIZE, pixels)
}

export function renderAppleTouchIcon(scale = APPLE_FLAG_SCALE) {
  const flagW = FLAG_W * scale
  const flagH = FLAG_H * scale
  const ox = Math.floor((APPLE_SIZE - flagW) / 2)
  const oy = Math.floor((APPLE_SIZE - flagH) / 2)
  /** @type {Array<readonly [number, number, number, number]>} */
  const pixels = []
  for (let y = 0; y < APPLE_SIZE; y += 1) {
    for (let x = 0; x < APPLE_SIZE; x += 1) {
      if (x >= ox && x < ox + flagW && y >= oy && y < oy + flagH) {
        const fx = Math.floor((x - ox) / scale)
        const fy = Math.floor((y - oy) / scale)
        const color = flagColor(fx, fy)
        pixels.push([color[0], color[1], color[2], 255])
      } else {
        pixels.push([0, 0, 0, 0])
      }
    }
  }
  return writePng(APPLE_SIZE, APPLE_SIZE, pixels)
}

export function generateFavicons({ outDir = publicDir } = {}) {
  const favicon32 = renderFavicon32()
  const appleTouch = renderAppleTouchIcon()
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'favicon-32x32.png'), favicon32)
  fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), appleTouch)
  return {
    favicon32Path: path.join(outDir, 'favicon-32x32.png'),
    appleTouchPath: path.join(outDir, 'apple-touch-icon.png'),
    favicon32Sha256: createHash('sha256').update(favicon32).digest('hex'),
    appleTouchSha256: createHash('sha256').update(appleTouch).digest('hex'),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = generateFavicons()
  console.log(`Wrote ${result.favicon32Path}`)
  console.log(`Wrote ${result.appleTouchPath}`)
}
