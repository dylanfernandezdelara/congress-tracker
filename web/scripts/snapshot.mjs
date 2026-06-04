import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit } from '@playwright/test'

const baseUrl = process.env.URL ?? 'http://127.0.0.1:5173'
const browserName = (process.env.BROWSER ?? 'chromium').toLowerCase()
const outDir = process.env.OUT_DIR ?? 'artifacts'
const selector = process.env.SELECTOR ?? 'body'
const rawPaths = process.env.PATHS ?? '/'
const waitUntil = process.env.WAIT_UNTIL ?? 'networkidle'
const assertText = process.env.ASSERT_TEXT?.trim() || ''

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const homeDir = process.env.HOME || ''

const parsePositiveInt = (name, fallback) => {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  console.warn(`[snapshot] ignoring invalid ${name}=${raw}; using ${fallback}`)
  return fallback
}

const viewportWidth = parsePositiveInt('VIEWPORT_WIDTH', 1280)
const viewportHeight = parsePositiveInt('VIEWPORT_HEIGHT', 720)
const settleMs = parsePositiveInt('SETTLE_MS', 500)

const findChromiumPath = async () => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  if (!homeDir) return null
  const base = path.join(homeDir, 'Library', 'Caches', 'ms-playwright')
  try {
    const entries = await fs.readdir(base)
    const chromiumDirs = entries
      .filter((name) => name.startsWith('chromium-'))
      .sort((a, b) => b.localeCompare(a))
    if (chromiumDirs.length === 0) return null
    const chromiumDir = chromiumDirs[0]
    const archDir = process.arch === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac'
    const appPath = path.join(
      base,
      chromiumDir,
      archDir,
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing'
    )
    await fs.access(appPath)
    return appPath
  } catch {
    return null
  }
}

const normalizePath = (value) => {
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('/')) return `${baseUrl}${value}`
  return `${baseUrl}/${value}`
}

const safeName = (value) =>
  value
    .replace(/^https?:\/\//, '')
    .replace(/\?.*$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'home'

const paths = rawPaths
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map(normalizePath)

const main = async () => {
  await fs.mkdir(outDir, { recursive: true })
  const errors = []

  const browserType = browserName === 'chromium' ? chromium : webkit
  const chromiumPath = browserName === 'chromium' ? await findChromiumPath() : null
  const browser = await browserType.launch({
    executablePath: chromiumPath || undefined,
  })
  const page = await browser.newPage({
    viewport: { width: viewportWidth, height: viewportHeight },
  })

  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()
    console.log(`[browser:${type}] ${text}`)
    if (type === 'error') errors.push(text)
  })
  page.on('pageerror', (err) => {
    const text = err?.message || String(err)
    console.log(`[pageerror] ${text}`)
    errors.push(text)
  })
  page.on('requestfailed', (req) => {
    const text = `${req.url()} :: ${req.failure()?.errorText || 'request failed'}`
    console.log(`[requestfailed] ${text}`)
    errors.push(text)
  })

  for (const url of paths) {
    console.log(`[snapshot] visiting ${url}`)
    await page.goto(url, { waitUntil })
    if (assertText) {
      await page.getByText(assertText, { exact: false }).first().waitFor({
        state: 'visible',
        timeout: 30_000,
      })
    }
    await sleep(settleMs)
    const name = safeName(url)
    const outPath = process.env.OUT
      ? process.env.OUT
      : path.join(outDir, `${name}.png`)
    if (selector === 'body') {
      await page.screenshot({
        path: outPath,
        fullPage: process.env.FULL_PAGE === '1',
        animations: 'disabled',
      })
    } else {
      await page.locator(selector).screenshot({ path: outPath, animations: 'disabled' })
    }
    const html = await page.content()
    console.log(`[snapshot] saved ${outPath} (${html.length} chars html)`)
  }

  await browser.close()

  if (errors.length > 0) {
    console.error(`[snapshot] completed with ${errors.length} browser errors`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
