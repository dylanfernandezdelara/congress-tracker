import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  FLAG_HEIGHT,
  FLAG_WIDTH,
  flagColor,
  generateFavicons,
  renderAppleTouchIcon,
  renderFavicon32,
} from './generate-favicons.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(rootDir, 'scripts', 'generate-favicons.mjs')
const publicDir = path.join(rootDir, 'web', 'public')
const faviconSvgPath = path.join(publicDir, 'favicon.svg')

const FILL_TO_RGB = {
  '#B22234': [178, 34, 52],
  '#FFFFFF': [255, 255, 255],
  '#3C3B6E': [60, 59, 110],
}

/** @param {string} svg */
function parseSvgFlagGrid(svg) {
  /** @type {Array<Array<[number, number, number] | null>>} */
  const grid = Array.from({ length: FLAG_HEIGHT }, () =>
    Array.from({ length: FLAG_WIDTH }, () => null),
  )

  const rectRe =
    /<rect\b(?=[^>]*\bwidth="(\d+)")(?=[^>]*\bheight="(\d+)")(?=[^>]*\bfill="([^"]+)")[^>]*>/g

  for (const match of svg.matchAll(rectRe)) {
    const width = Number(match[1])
    const height = Number(match[2])
    const fill = match[3]
    const rgb = FILL_TO_RGB[fill]
    assert.ok(rgb, `unexpected fill ${fill}`)

    const attrs = match[0]
    const x = Number(/(?:^|\s)x="(\d+)"/.exec(attrs)?.[1] ?? 0)
    const y = Number(/(?:^|\s)y="(\d+)"/.exec(attrs)?.[1] ?? 0)

    for (let dy = 0; dy < height; dy += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        grid[y + dy][x + dx] = rgb
      }
    }
  }

  return grid
}

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

test('generateFavicons writes crisp PNGs with expected dimensions', () => {
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('checked-in favicon PNGs match generator output', () => {
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
})

test('generator flagColor matches favicon.svg rects', () => {
  const svg = fs.readFileSync(faviconSvgPath, 'utf8')
  const grid = parseSvgFlagGrid(svg)
  for (let y = 0; y < FLAG_HEIGHT; y += 1) {
    for (let x = 0; x < FLAG_WIDTH; x += 1) {
      const fromSvg = grid[y][x]
      const fromGenerator = flagColor(x, y)
      assert.ok(fromSvg, `missing svg pixel at ${x},${y}`)
      assert.ok(fromGenerator, `missing generator pixel at ${x},${y}`)
      assert.deepEqual(fromGenerator, fromSvg)
    }
  }
})

test('generator output is deterministic', () => {
  const a = createHash('sha256').update(renderFavicon32()).digest('hex')
  const b = createHash('sha256').update(renderFavicon32()).digest('hex')
  const c = createHash('sha256').update(renderAppleTouchIcon()).digest('hex')
  const d = createHash('sha256').update(renderAppleTouchIcon()).digest('hex')
  assert.equal(a, b)
  assert.equal(c, d)
})
