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

const LONG_DIGEST_LEAD =
  'This bill blocks federal aid for students enrolled at institutions with no physical campus.'
const LONG_DIGEST = `${LONG_DIGEST_LEAD} ${'It also adds reporting requirements. '.repeat(8)}`.trim()

const MOCK_FEED = {
  items: [
    {
      bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
      policy_area: 'Defense',
      digest: {
        headline: 'Plain headline for readers',
        what_it_does: LONG_DIGEST,
        key_points: [
          'Blocks aid for ghost enrollments',
          'Requires campus verification',
          'Adds annual reporting rules',
        ],
        terms_explained: [],
      },
      raw_summary_text: `${'Official CRS summary text. '.repeat(40)}`.trim(),
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
  ],
  total: 1,
  limit: 50,
  offset: 0,
  has_more: false,
}

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
    const heading = document.querySelector('h1')
    const siteNav = document.querySelector('.site-nav')
    const membersSidebar = document.querySelector('[aria-label="Members in Congress"]')
    const feedRow = document.querySelector('.feed-row')
    const topic = document.querySelector('[data-feed-topic]')
    const policyArea = document.querySelector('[data-feed-policy-area]')
    const eventLine = document.querySelector('.feed-row-event:not([hidden])')
    const summary = document.querySelector('[data-feed-summary]')
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

    if (!heading) issues.push('page heading missing')
    if (heading && heading.textContent?.trim() !== 'Congress Tracker') {
      issues.push('page heading should read Congress Tracker')
    }
    if (!siteNav) issues.push('site navigation missing')
    if (membersSidebar) issues.push('sidebar stats visible on feed page')
    if (!feedRow) issues.push('feed row missing')

    if (heading) collectFullClipping(heading.getBoundingClientRect(), 'page heading')

    if (feedRow) {
      const rowRect = feedRow.getBoundingClientRect()
      collectHorizontalClipping(rowRect, 'feed row')
      if (rowRect.bottom <= 0 || rowRect.top >= viewportHeight) {
        issues.push('feed row not visible in viewport')
      }
      // The collapsed row height is intentionally content-driven now that the
      // full summary is shown, so we no longer assert an absolute max height —
      // the line-clamp guard below catches the truncation regressions we care about.
    }

    if (topic) {
      collectHorizontalClipping(topic.getBoundingClientRect(), 'feed topic')
    } else {
      issues.push('feed topic missing')
    }

    if (eventLine) {
      const eventRect = eventLine.getBoundingClientRect()
      collectHorizontalClipping(eventRect, 'feed event line')
      if (eventRect.bottom <= 0 || eventRect.top >= viewportHeight) {
        issues.push('feed event line not visible in viewport')
      }
    } else {
      const marginChip = document.querySelector('.feed-row-chip--margin')
      if (marginChip) {
        collectHorizontalClipping(marginChip.getBoundingClientRect(), 'feed vote margin')
      } else {
        issues.push('feed event line or vote margin missing')
      }
    }

    if (policyArea) {
      collectHorizontalClipping(policyArea.getBoundingClientRect(), 'feed policy area')
      if (viewportWidth < 640) {
        const policyRect = policyArea.getBoundingClientRect()
        if (policyRect.bottom <= 0 || policyRect.top >= viewportHeight) {
          issues.push('feed policy area not visible on mobile')
        }
      }
    }

    if (summary) {
      collectHorizontalClipping(summary.getBoundingClientRect(), 'feed summary')

      // The feed must show the summary in full on every viewport, so guard against
      // any line-clamp creeping back onto the teaser or the bullet list.
      const clampTargets = [
        ['feed teaser', summary.querySelector('.feed-row-teaser')],
        ['feed summary bullets', summary.querySelector('.feed-row-summary-bullets')],
      ]
      for (const [label, element] of clampTargets) {
        if (!element) continue
        const style = window.getComputedStyle(element)
        const lineClamp = style.webkitLineClamp || style.getPropertyValue('-webkit-line-clamp')
        if (lineClamp && lineClamp !== 'none' && lineClamp !== 'unset' && Number(lineClamp) > 0) {
          issues.push(`${label} is line-clamped (summary truncated)`)
        }
      }
    } else {
      issues.push('feed summary missing')
    }

    return {
      issues,
      theme: document.documentElement.dataset.theme ?? 'light',
    }
  })
}

const MOCK_SESSION_STATS = {
  congress: 119,
  session: 2,
  as_of: '2026-06-14T00:00:00.000Z',
  house: {
    passage_vote_count: 2,
    unique_bills_passed: 2,
    avg_margin: 12,
    closest_margin: 5,
    date_range: { first: '2026-06-01', last: '2026-06-05' },
    coverage_days: 5,
  },
  senate: {
    passage_vote_count: 1,
    unique_bills_passed: 1,
    avg_margin: 5,
    closest_margin: 5,
    date_range: { first: '2026-06-05', last: '2026-06-05' },
    coverage_days: 1,
  },
}

const MOCK_PULSE_STATS = {
  congress: 119,
  session: 2,
  as_of: '2026-06-14T00:00:00.000Z',
  house: {
    close_votes: [],
    policy_heat: [{ policy_area: 'Defense', bill_count: 1 }],
    this_week: { count: 1, headline: 'This week sample headline', bill_type: 's', bill_number: 2, congress: 119 },
  },
  senate: {
    close_votes: [],
    policy_heat: [],
    this_week: { count: 0, headline: null, bill_type: null, bill_number: null, congress: null },
  },
}

const MOCK_DEFECTORS = {
  chamber: 'House',
  congress: 119,
  session: 2,
  defectors: [],
  as_of: '2026-06-14T00:00:00.000Z',
}

const MOCK_PORTFOLIOS = {
  chamber: 'House',
  congress: 119,
  session: 2,
  gainers: [],
  losers: [],
  disclaimer: 'Estimates from public disclosures.',
  as_of: '2026-06-14T00:00:00.000Z',
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

        await page.route('**/feed/latest.json**', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_FEED),
          })
        })

        await page.route('**/stats/session.json', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_SESSION_STATS),
          })
        })

        await page.route('**/stats/pulse.json', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_PULSE_STATS),
          })
        })

        await page.route('**/stats/defectors.json**', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_DEFECTORS),
          })
        })

        await page.route('**/stats/portfolios.json**', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_PORTFOLIOS),
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

        const feedScreenshotPath = path.join(outDir, `${caseId}.png`)
        await page.screenshot({ path: feedScreenshotPath, fullPage: false })

        await page.goto(`${baseUrl.replace(/\/$/, '')}/stats`, { waitUntil: 'domcontentloaded' })
        await page.getByLabel('Members in Congress').waitFor({ timeout: 10_000 })
        const statsIssues = await page.evaluate(() => {
          const issues = []
          if (!document.querySelector('[aria-label="Members in Congress"]')) {
            issues.push('members section missing on stats page')
          }
          if (!document.querySelector('[aria-label="Legislative pulse"]')) {
            issues.push('pulse section missing on stats page')
          }
          if (!document.querySelector('.site-nav')) {
            issues.push('site navigation missing on stats page')
          }
          return issues
        })
        audit.issues.push(...statsIssues)

        const passed = audit.issues.length === 0
        if (!passed) failures += 1

        results.push({
          id: caseId,
          viewport: viewport.label,
          theme,
          passed,
          issues: audit.issues,
          screenshot: path.relative(rootDir, feedScreenshotPath),
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
