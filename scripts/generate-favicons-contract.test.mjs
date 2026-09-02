import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import {
  FAVICON_PNG_ASSETS,
  FAVICON_VIEWBOX,
  compositeCoveragePixel,
  generateFavicons,
  renderFaviconAsset,
  renderFaviconPng,
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

/** Midpoint of the first white stripe in viewBox units. */
function stripeSampleY() {
  return (FAVICON_VIEWBOX / 13) * 1.5
}

function firstStarCenter() {
  const cantonW = FAVICON_VIEWBOX * (2 / 5)
  const cantonH = (7 / 13) * FAVICON_VIEWBOX
  return [cantonW / 4, cantonH / 4]
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
    for (const asset of FAVICON_PNG_ASSETS) {
      const filePath = result[`${asset.id}Path`]
      assert.equal(filePath, path.join(tmpDir, asset.file))
      const meta = readPngMeta(fs.readFileSync(filePath))
      assert.equal(meta.width, asset.size)
      assert.equal(meta.height, asset.size)
      assert.equal(meta.colorType, 6)
    }
    assert.equal(FAVICON_VIEWBOX, 512)
    const svg = fs.readFileSync(result.faviconSvgPath, 'utf8')
    assert.match(svg, /viewBox="0 0 512 512"/)
    assert.match(svg, /fill-rule="evenodd"/)
    assert.match(svg, /<path\b[^>]*scale\(/)
    assert.doesNotMatch(svg, /crispEdges|shape-rendering/)
    assert.doesNotMatch(svg, /0000000/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

/**
 * Hash of what a PNG encodes (dimensions, color type, decoded scanlines), not
 * its bytes: zlib produces different deflate streams across Node versions.
 * @param {Buffer} png
 */
function pngPixelSha(png) {
  const { width, height, colorType } = readPngMeta(png)
  return createHash('sha256')
    .update(`${width}x${height}:${colorType}:`)
    .update(inflatePngRgba(png))
    .digest('hex')
}

test('checked-in favicon assets match generator output', () => {
  for (const asset of FAVICON_PNG_ASSETS) {
    const expectedSha = pngPixelSha(renderFaviconAsset(asset.id))
    const committedSha = pngPixelSha(fs.readFileSync(path.join(publicDir, asset.file)))
    assert.equal(expectedSha, committedSha, `${asset.file} out of sync with generator`)
  }
  assert.equal(
    fs.readFileSync(faviconSvgPath, 'utf8'),
    renderFaviconSvg(),
  )
})

test('index.html links SVG plus high-res PNG favicons from asset table', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8')
  assert.match(html, /rel="icon"[^>]*href="\/favicon\.svg"/)
  for (const asset of FAVICON_PNG_ASSETS) {
    if (!asset.htmlRel || !asset.htmlSizes) continue
    const escapedFile = asset.file.replace(/\./g, '\\.')
    const escapedSizes = asset.htmlSizes.replace(/x/g, 'x')
    assert.match(
      html,
      new RegExp(
        `rel="${asset.htmlRel}"[^>]*href="/${escapedFile}"[^>]*sizes="${escapedSizes}"`,
      ),
      `missing link for ${asset.file}`,
    )
  }
})

test('sampleFaviconColor covers flag stripes, canton, and stars', () => {
  assert.equal(sampleFaviconColor(-1, -1), null)
  assert.equal(sampleFaviconColor(FAVICON_VIEWBOX + 1, 10), null)
  assert.deepEqual(sampleFaviconColor(400, 10), [178, 34, 52])
  assert.deepEqual(sampleFaviconColor(400, stripeSampleY()), [255, 255, 255])
  assert.deepEqual(sampleFaviconColor(20, 40), [60, 59, 110])
  const [sx, sy] = firstStarCenter()
  assert.deepEqual(sampleFaviconColor(sx, sy), [255, 255, 255])
})

test('full-bleed favicon has no black/transparent letterboxing', () => {
  const png = renderFaviconPng(32)
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
    assert.ok(r + g + b > 0, `corner/edge (${x},${y}) must not be black`)
  }
})

test('coverage compositing keeps straight (non-premultiplied) RGB', () => {
  const red = /** @type {const} */ ([178, 34, 52])
  // Half miss / half red → straight red RGB at 50% alpha (not premultiplied 89/17/26).
  assert.deepEqual(
    compositeCoveragePixel([null, null, null, null, red, red, red, red]),
    [178, 34, 52, 128],
  )
  assert.deepEqual(compositeCoveragePixel([null, null, null, null]), [0, 0, 0, 0])
  assert.deepEqual(compositeCoveragePixel([red, red, red, red]), [178, 34, 52, 255])
})

test('stripe boundary pixels antialias between red and white', () => {
  // First white stripe starts at y = viewBox/13. On a 32px raster that is ~2.46,
  // so row 2 is a blend of red → white.
  const png = renderFaviconPng(32)
  const width = png.readUInt32BE(16)
  const raw = inflatePngRgba(png)
  const [r, g, b, a] = rgbaAt(raw, width, 28, 2)
  assert.equal(a, 255)
  assert.ok(r >= 178 && g >= 34 && b >= 52)
  assert.ok(g > 34 || b > 52 || r > 178, 'expected blend toward white stripe')
})

test('generator output is deterministic', () => {
  for (const asset of FAVICON_PNG_ASSETS) {
    const a = createHash('sha256').update(renderFaviconAsset(asset.id)).digest('hex')
    const b = createHash('sha256').update(renderFaviconAsset(asset.id)).digest('hex')
    assert.equal(a, b, `${asset.id} not deterministic`)
  }
  assert.equal(renderFaviconSvg(), renderFaviconSvg())
})
