#!/usr/bin/env node
/**
 * Viewport QA for the web UI.
 *
 * Run with the dev server up: npm run dev:web
 * Usage: npm run qa:web
 * Env: QA_WEB_URL (default http://localhost:5173), QA_WEB_OUT_DIR (default artifacts/qa-viewports)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.QA_WEB_URL ?? 'http://localhost:5173'
const outDir = path.resolve(rootDir, process.env.QA_WEB_OUT_DIR ?? 'artifacts/qa-viewports')

const VIEWPORTS = [
  { id: 'mobile-narrow', width: 320, height: 568, label: 'iPhone SE' },
  { id: 'mobile', width: 390, height: 844, label: 'iPhone 14' },
  { id: 'desktop', width: 1280, height: 800, label: 'Desktop' },
  { id: 'desktop-wide', width: 1440, height: 900, label: 'Desktop wide' },
]

const THEMES = ['light', 'dark']

const MOCK_FEED = [
  {
    bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
    policy_area: 'Defense',
    digest: {
      headline: 'Plain headline for readers',
      what_it_does: 'It does something important in plain language.',
      key_points: ['Point one'],
      terms_explained: [],
    },
    raw_summary_text: 'Official CRS summary text.',
    passage_votes: [
      {
        chamber: 'Senate',
        question: 'On Passage of the Bill',
        result: 'Passed',
        yeas: 52,
        nays: 47,
        date: '2026-06-05',
      },
    ],
    latest_passage_date: '2026-06-05',
  },
]

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error(
      'Playwright is required for viewport QA. Run: npm install && npx playwright install chromium',
    )
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Dev server not reachable at ${url}. Start it with: npm run dev:web`)
}

async function auditPage(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const toggle = document.querySelector('.theme-toggle')
    const heading = document.querySelector('h1')
    const card = document.querySelector('.flip-card')
    const headline = document.querySelector('.flip-card h2')
    const issues = []

    const collectHorizontalClipping = (rect, label) => {
      if (rect.left < -0.5) issues.push(`${label} clipped on the left`)
      if (rect.right > viewportWidth + 0.5) issues.push(`${label} clipped on the right`)
      if (rect.width <= 0 || rect.height <= 0) issues.push(`${label} not visible`)
    }

    const collectFullClipping = (rect, label) => {
      collectHorizontalClipping(rect, label)
      if (rect.top < -0.5) issues.push(`${label} clipped on the top`)
      if (rect.bottom > viewportHeight + 0.5) issues.push(`${label} clipped on the bottom`)
    }

    if (!toggle) issues.push('theme toggle missing')
    if (!heading) issues.push('page heading missing')
    if (!card) issues.push('feed card missing')

    if (toggle) {
      collectFullClipping(toggle.getBoundingClientRect(), 'theme toggle')

      const svg = toggle.querySelector('svg')
      if (!svg) {
        issues.push('theme toggle svg missing')
      } else {
        const vb = svg.viewBox.baseVal
        const bbox = svg.getBBox()
        const strokePad = 1.25
        if (bbox.x < vb.x - strokePad) issues.push('theme icon clipped on the left')
        if (bbox.y < vb.y - strokePad) issues.push('theme icon clipped on the top')
        if (bbox.x + bbox.width > vb.x + vb.width + strokePad) {
          issues.push('theme icon clipped on the right')
        }
        if (bbox.y + bbox.height > vb.y + vb.height + strokePad) {
          issues.push('theme icon clipped on the bottom')
        }
      }
    }

    if (heading) collectFullClipping(heading.getBoundingClientRect(), 'page heading')
    if (card) {
      const cardRect = card.getBoundingClientRect()
      collectHorizontalClipping(cardRect, 'feed card')
      if (cardRect.bottom <= 0 || cardRect.top >= viewportHeight) {
        issues.push('feed card not visible in viewport')
      }
    }
    if (headline) collectHorizontalClipping(headline.getBoundingClientRect(), 'feed headline')

    const touchLayout =
      viewportWidth < 640 ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 639px), (pointer: coarse)').matches)

    if (touchLayout && card) {
      const front = card.querySelector('.flip-card-front .feed-card-surface')
      const body = front?.querySelector('p.text-secondary')
      const footer = front?.querySelector('div:last-child')
      if (body && footer) {
        const gap = footer.getBoundingClientRect().top - body.getBoundingClientRect().bottom
        if (gap > 48) {
          issues.push(`excessive blank space in feed card (${Math.round(gap)}px between summary and footer)`)
        }
      }
    }

    return {
      issues,
      theme: document.documentElement.dataset.theme ?? 'light',
    }
  })
}

async function main() {
  await waitForServer(baseUrl)

  const { chromium } = await loadPlaywright()
  fs.mkdirSync(outDir, { recursive: true })

  const results = []
  let failures = 0

  const browser = await chromium.launch()

  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const caseId = `${viewport.id}-${theme}`
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.width < 500 ? 2 : 1,
        })

        await page.route('**/feed/latest.json', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_FEED),
          })
        })

        await page.route('https://fonts.googleapis.com/**', async (route) => route.abort())
        await page.route('https://fonts.gstatic.com/**', async (route) => route.abort())

        await page.addInitScript((selectedTheme) => {
          localStorage.setItem('theme', selectedTheme)
          document.documentElement.dataset.theme = selectedTheme
        }, theme)

        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
        await page.getByText('Plain headline for readers').waitFor({ timeout: 10_000 })

        const audit = await auditPage(page)
        if (audit.theme !== theme) {
          audit.issues.push(`expected ${theme} theme but got ${audit.theme}`)
        }

        const screenshotPath = path.join(outDir, `${caseId}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: false })

        const passed = audit.issues.length === 0
        if (!passed) failures += 1

        results.push({
          id: caseId,
          viewport: viewport.label,
          theme,
          passed,
          issues: audit.issues,
          screenshot: path.relative(rootDir, screenshotPath),
        })

        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    baseUrl,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: failures,
    results,
  }

  const summaryPath = path.join(outDir, 'summary.json')
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)

  console.log(`Viewport QA: ${summary.passed}/${summary.total} passed`)
  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL'
    console.log(`  [${status}] ${result.viewport} / ${result.theme}`)
    if (!result.passed) {
      for (const issue of result.issues) {
        console.log(`         - ${issue}`)
      }
    }
  }
  console.log(`Artifacts: ${path.relative(rootDir, outDir)}/`)

  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
