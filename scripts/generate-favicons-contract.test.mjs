import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import {
  FAVICON_PNG_SIZES,
  FAVICON_VIEWBOX,
  generateFavicons,
  renderAppleTouchIcon,
  renderFavicon192,
  renderFavicon32,
  renderFavicon48,
  renderFavicon512,
  renderFaviconSvg,
  sampleFaviconColor,
} from './generate-favicons.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(rootDir, 'scripts', 'generate-favicons.mjs')
const publicDir = path.join(rootDir, 'web', 'public')
const faviconSvgPath = path.join(publicDir, 'favicon.svg')
const indexHtmlPath = path.join(rootDir, 'web', 'index.html')
const brandFlagPath = path.join(rootDir, 'web', 'src', 'components', 'BrandFlagIcon.tsx')

/** @param {Buffer} png */
function readPngMeta(png) {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const colorType = png[25]
  return { width, height, colorType }
}

/**
 * @param {Buffer} png
 * @returns {Buffer} raw scanlines (filter byte + RGBA per row)
 */
function inflatePngRgba(png) {
  let offset = 8
  /** @type {Buffer | null} */
  let idat = null
  while (offset < png.length) {
    const len = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    const data = png.subarray(offset + 8, offset + 8 + len)
    if (type === 'IDAT') idat = idat ? Buffer.concat([idat, data]) : data
    offset += 12 + len
  }
  assert.ok(idat)
  return zlib.inflateSync(idat)
}

/**
 * @param {Buffer} raw
 * @param {number} width
 * @param {number} x
 * @param {number} y
 */
function rgbaAt(raw, width, x, y) {
  const bpp = 4
  const i = y * (1 + width * bpp) + 1 + x * bpp
  return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]]
}

test('generate-favicons script exists', () => {
  assert.ok(fs.statSync(scriptPath).isFile())
})

test('header brand mark is a separate high-detail component', () => {
  assert.ok(fs.statSync(brandFlagPath).isFile())
  const src = fs.readFileSync(brandFlagPath, 'utf8')
  assert.match(src, /BrandFlagIcon/)
  assert.match(src, /FLAG_W = 190/)
  assert.match(src, /FLAG_H = 100/)
  assert.match(src, /STAR_CENTERS\.map/)
  assert.doesNotMatch(src, /crispEdges|pixelated|8-bit/i)

  const chromeCss = fs.readFileSync(
    path.join(rootDir, 'web', 'src', 'styles', 'chrome.css'),
    'utf8',
  )
  const brandBlock = /\.brand-flag-icon\s*\{[^}]+\}/.exec(chromeCss)?.[0] ?? ''
  assert.match(brandBlock, /\.brand-flag-icon/)
  assert.doesNotMatch(brandBlock, /pixelated|crisp-edges/)
})

test('generateFavicons writes full-bleed high-res PNGs + SVG', () => {
  const tmpDir = fs.mkdtempSync(path.join(rootDir, '.favicon-gen-'))
  try {
    const result = generateFavicons({ outDir: tmpDir })
    const checks = [
      [result.favicon32Path, FAVICON_PNG_SIZES.favicon32],
      [result.favicon48Path, FAVICON_PNG_SIZES.favicon48],
      [result.favicon192Path, FAVICON_PNG_SIZES.favicon192],
      [result.favicon512Path, FAVICON_PNG_SIZES.favicon512],
      [result.appleTouchPath, FAVICON_PNG_SIZES.appleTouch],
    ]
    for (const [filePath, size] of checks) {
      const meta = readPngMeta(fs.readFileSync(filePath))
      assert.equal(meta.width, size)
      assert.equal(meta.height, size)
      assert.equal(meta.colorType, 6)
    }
    assert.equal(FAVICON_VIEWBOX, 512)
    const svg = fs.readFileSync(result.faviconSvgPath, 'utf8')
    assert.match(svg, /viewBox="0 0 512 512"/)
    assert.match(svg, /fill-rule="evenodd"/)
    assert.match(svg, /<path\b[^>]*scale\(/)
    assert.doesNotMatch(svg, /crispEdges|shape-rendering/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('checked-in favicon assets match generator output', () => {
  /** @type {Array<[() => Buffer, string]>} */
  const assets = [
    [renderFavicon32, 'favicon-32x32.png'],
    [renderFavicon48, 'favicon-48x48.png'],
    [renderFavicon192, 'favicon-192x192.png'],
    [renderFavicon512, 'favicon-512x512.png'],
    [renderAppleTouchIcon, 'apple-touch-icon.png'],
  ]
  for (const [render, filename] of assets) {
    const expectedSha = createHash('sha256').update(render()).digest('hex')
    const committedSha = createHash('sha256')
      .update(fs.readFileSync(path.join(publicDir, filename)))
      .digest('hex')
    assert.equal(expectedSha, committedSha, `${filename} out of sync with generator`)
  }
  assert.equal(
    fs.readFileSync(faviconSvgPath, 'utf8'),
    renderFaviconSvg(),
  )
})

test('index.html links SVG plus high-res PNG favicons', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8')
  assert.match(html, /rel="icon"[^>]*href="\/favicon\.svg"/)
  assert.match(html, /rel="icon"[^>]*href="\/favicon-32x32\.png"[^>]*sizes="32x32"/)
  assert.match(html, /rel="icon"[^>]*href="\/favicon-48x48\.png"[^>]*sizes="48x48"/)
  assert.match(html, /rel="icon"[^>]*href="\/favicon-192x192\.png"[^>]*sizes="192x192"/)
  assert.match(html, /rel="icon"[^>]*href="\/favicon-512x512\.png"[^>]*sizes="512x512"/)
  assert.match(html, /rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/)
})

test('sampleFaviconColor covers flag stripes, canton, and stars', () => {
  // Outside the square canvas → transparent
  assert.equal(sampleFaviconColor(-1, -1), null)
  assert.equal(sampleFaviconColor(FAVICON_VIEWBOX + 1, 10), null)
  // Red stripe near top-right of flag (full-bleed)
  assert.deepEqual(sampleFaviconColor(400, 10), [178, 34, 52])
  // White stripe (stripe index 1)
  assert.deepEqual(sampleFaviconColor(400, STRIPE_SAMPLE_Y()), [255, 255, 255])
  // Canton blue
  assert.deepEqual(sampleFaviconColor(20, 40), [60, 59, 110])
  // First star center
  const [sx, sy] = FIRST_STAR_CENTER()
  assert.deepEqual(sampleFaviconColor(sx, sy), [255, 255, 255])
})

/** Midpoint of the first white stripe in viewBox units. */
function STRIPE_SAMPLE_Y() {
  return (FAVICON_VIEWBOX / 13) * 1.5
}

function FIRST_STAR_CENTER() {
  const cantonW = FAVICON_VIEWBOX * (2 / 5)
  const cantonH = (7 / 13) * FAVICON_VIEWBOX
  return [cantonW / 4, cantonH / 4]
}

test('full-bleed favicon has no black/transparent letterboxing', () => {
  const png = renderFavicon32()
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  assert.equal(width, 32)
  assert.equal(height, 32)
  const raw = inflatePngRgba(png)

  for (const [x, y] of [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
  ]) {
    const [r, g, b, a] = rgbaAt(raw, width, x, y)
    assert.equal(a, 255, `corner/edge (${x},${y}) must be opaque, got alpha ${a}`)
    // Must not be black filler
    assert.ok(r + g + b > 0, `corner/edge (${x},${y}) must not be black`)
  }
})

test('stripe boundary pixels keep straight (non-premultiplied) RGB', () => {
  // First white stripe starts at y = viewBox/13. On a 32px raster that is ~2.46,
  // so row 2 is a partial cover of red → white.
  const png = renderFavicon32()
  const width = png.readUInt32BE(16)
  const raw = inflatePngRgba(png)
  const [r, g, b, a] = rgbaAt(raw, width, 28, 2)
  assert.equal(a, 255)
  // Antialiased blend between red and white — both channels elevated vs pure red.
  assert.ok(r >= 178 && g >= 34 && b >= 52)
  assert.ok(g > 34 || b > 52 || r > 178, 'expected blend toward white stripe')
})

test('generator output is deterministic', () => {
  const pairs = [
    [renderFavicon32, renderFavicon32],
    [renderFavicon48, renderFavicon48],
    [renderFavicon192, renderFavicon192],
    [renderFavicon512, renderFavicon512],
    [renderAppleTouchIcon, renderAppleTouchIcon],
  ]
  for (const [a, b] of pairs) {
    assert.equal(
      createHash('sha256').update(a()).digest('hex'),
      createHash('sha256').update(b()).digest('hex'),
    )
  }
  assert.equal(renderFaviconSvg(), renderFaviconSvg())
})
