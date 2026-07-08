import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.AUDIT_URL ?? 'https://congress-tracker-api.fernandezdelaradylan.workers.dev'
const OUT = 'artifacts/mobile-audit'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

async function shot(name, { width, height, theme, actions }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
  })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('theme', t)
  }, theme)
  await page.waitForTimeout(600)
  if (actions) await actions(page)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  await ctx.close()
  console.log('captured', name)
}

// iPhone 14 width feed, light + dark, full page
await shot('feed-390-light', { width: 390, height: 844, theme: 'light' })
await shot('feed-390-dark', { width: 390, height: 844, theme: 'dark' })
// iPhone SE narrow
await shot('feed-320-light', { width: 320, height: 568, theme: 'light' })

// Expanded first feed row
await shot('feed-390-expanded-light', {
  width: 390,
  height: 844,
  theme: 'light',
  actions: async (page) => {
    await page.locator('.feed-row-toggle').first().tap()
    await page.waitForTimeout(800)
  },
})

// Nav menu open
await shot('nav-390-light', {
  width: 390,
  height: 844,
  theme: 'light',
  actions: async (page) => {
    const btn = page.locator('header button').last()
    await btn.tap()
    await page.waitForTimeout(500)
  },
})

// Stats page
async function shotPath(name, path, { width, height, theme }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('theme', t)
  }, theme)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  await ctx.close()
  console.log('captured', name)
}

await shotPath('stats-390-light', '/stats', { width: 390, height: 844, theme: 'light' })

await browser.close()
