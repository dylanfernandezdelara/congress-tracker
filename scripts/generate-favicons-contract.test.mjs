import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import {
  FAVICON_VIEWBOX,
  generateFavicons,
  renderAppleTouchIcon,
  renderFavicon32,
  renderFaviconSvg,
  sampleFaviconColor,
} from './generate-favicons.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(rootDir, 'scripts', 'generate-favicons.mjs')
const publicDir = path.join(rootDir, 'web', 'public')
const faviconSvgPath = path.join(publicDir, 'favicon.svg')
const brandFlagPath = path.join(rootDir, 'web', 'src', 'components', 'BrandFlagIcon.tsx')

/** @param {Buffer} png */
function readPngMeta(png) {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const colorType = png[25]
  return { width, height, colorType }
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

test('generateFavicons writes antialiased PNGs + SVG with expected dimensions', () => {
  const tmpDir = fs.mkdtempSync(path.join(rootDir, '.favicon-gen-'))
  try {
    const result = generateFavicons({ outDir: tmpDir })
    const faviconMeta = readPngMeta(fs.readFileSync(result.favicon32Path))
    const appleMeta = readPngMeta(fs.readFileSync(result.appleTouchPath))
    assert.equal(faviconMeta.width, 32)
    assert.equal(faviconMeta.height, 32)
    assert.equal(faviconMeta.colorType, 6)
    assert.equal(appleMeta.width, 180)
    assert.equal(appleMeta.height, 180)
    assert.equal(appleMeta.colorType, 6)
    assert.equal(FAVICON_VIEWBOX, 32)
    const svg = fs.readFileSync(result.faviconSvgPath, 'utf8')
    assert.match(svg, /viewBox="0 0 32 32"/)
    assert.match(svg, /fill-rule="evenodd"/)
    assert.match(svg, /<path\b[^>]*scale\(/)
    assert.doesNotMatch(svg, /crispEdges|shape-rendering/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('checked-in favicon assets match generator output', () => {
  const expectedFaviconSha = createHash('sha256').update(renderFavicon32()).digest('hex')
  const expectedAppleSha = createHash('sha256').update(renderAppleTouchIcon()).digest('hex')
  const committedFaviconSha = createHash('sha256')
    .update(fs.readFileSync(path.join(publicDir, 'favicon-32x32.png')))
    .digest('hex')
  const committedAppleSha = createHash('sha256')
    .update(fs.readFileSync(path.join(publicDir, 'apple-touch-icon.png')))
    .digest('hex')
  assert.equal(expectedFaviconSha, committedFaviconSha)
  assert.equal(expectedAppleSha, committedAppleSha)
  assert.equal(
    fs.readFileSync(faviconSvgPath, 'utf8'),
    renderFaviconSvg(),
  )
})

test('sampleFaviconColor covers flag stripes, canton, and stars', () => {
  // Outside the flag pad → transparent
  assert.equal(sampleFaviconColor(0.2, 0.2), null)
  // Red stripe near top-right of flag
  assert.deepEqual(sampleFaviconColor(20, 8), [178, 34, 52])
  // White stripe
  assert.deepEqual(sampleFaviconColor(20, 9.4), [255, 255, 255])
  // Canton blue
  assert.deepEqual(sampleFaviconColor(2, 10), [60, 59, 110])
  // Star center + off-center tip (evenodd fill agreement)
  assert.deepEqual(sampleFaviconColor(3.5, 9.3), [255, 255, 255])
  assert.deepEqual(sampleFaviconColor(3.5, 8.5), [255, 255, 255])
})

test('antialiased edge pixels keep straight (non-premultiplied) RGB', () => {
  // Top edge of the flag sits at y=7.5 on a 32 viewBox → PNG row ~7 is half-covered.
  const png = renderFavicon32()
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  assert.equal(width, 32)
  assert.equal(height, 32)

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
  const raw = zlib.inflateSync(idat)
  const bpp = 4
  const row = 7
  const col = 16
  const i = row * (1 + width * bpp) + 1 + col * bpp
  const r = raw[i]
  const g = raw[i + 1]
  const b = raw[i + 2]
  const a = raw[i + 3]
  assert.ok(a > 0 && a < 255, `expected partial alpha, got ${a}`)
  assert.equal(r, 178)
  assert.equal(g, 34)
  assert.equal(b, 52)
})

test('generator output is deterministic', () => {
  const a = createHash('sha256').update(renderFavicon32()).digest('hex')
  const b = createHash('sha256').update(renderFavicon32()).digest('hex')
  const c = createHash('sha256').update(renderAppleTouchIcon()).digest('hex')
  const d = createHash('sha256').update(renderAppleTouchIcon()).digest('hex')
  assert.equal(a, b)
  assert.equal(c, d)
  assert.equal(renderFaviconSvg(), renderFaviconSvg())
})
