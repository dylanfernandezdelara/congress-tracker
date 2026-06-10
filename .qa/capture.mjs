import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { join } from 'path'

const URL =
  'https://fb461886-congress-tracker-api.fernandezdelaradylan.workers.dev'
const SHOTS = '/workspace/.qa/shots'
const RESULTS_PATH = '/workspace/.qa/results.json'

const results = {
  url: URL,
  capturedAt: new Date().toISOString(),
  documentTitle: null,
  favicon: { requested: false, succeeded: false, status: null, url: null },
  console: { errors: [], warnings: [] },
  failedRequests: [],
  checks: {},
  metadata: {},
}

function recordCheck(name, pass, details) {
  results.checks[name] = { pass, details }
}

async function waitForCards(page, timeout = 15000) {
  await page.waitForSelector('.flip-card', { timeout })
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {})
  await page.waitForTimeout(500)
}

async function captureDesktop(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()
    if (type === 'error') results.console.errors.push(text)
    if (type === 'warning') results.console.warnings.push(text)
  })

  page.on('requestfailed', (req) => {
    results.failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText ?? 'unknown',
      status: null,
    })
  })

  page.on('response', (res) => {
    const status = res.status()
    const resUrl = res.url()
    if (resUrl.includes('favicon')) {
      results.favicon.requested = true
      results.favicon.url = resUrl
      results.favicon.status = status
      results.favicon.succeeded = status >= 200 && status < 400
    }
    if (status >= 400) {
      results.failedRequests.push({
        url: resUrl,
        method: res.request().method(),
        status,
        failure: null,
      })
    }
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await waitForCards(page)

  results.documentTitle = await page.title()

  const cardCount = await page.locator('.flip-card').count()
  recordCheck(
    'feed_renders_min_5_cards',
    cardCount >= 5,
    `Found ${cardCount} cards (expected >= 5)`,
  )

  const voteBars = await page.locator('.bg-pass, .bg-fail').count()
  recordCheck(
    'vote_split_bars_visible',
    voteBars > 0,
    `Found ${voteBars} green/red vote bar segments`,
  )

  await page.screenshot({ path: join(SHOTS, 'desktop-top.png') })

  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2))
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(SHOTS, 'desktop-scrolled.png') })

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)

  const firstCardInner = page.locator('.flip-card').first().locator('.flip-card-inner')
  const pressedBefore = await firstCardInner.getAttribute('aria-pressed')
  await firstCardInner.click()
  await page.waitForTimeout(800)
  const pressedAfterFirst = await firstCardInner.getAttribute('aria-pressed')
  const flipOnClick =
    pressedBefore === 'false' && pressedAfterFirst === 'true'
  recordCheck(
    'first_card_flips_on_click',
    flipOnClick,
    `aria-pressed: ${pressedBefore} → ${pressedAfterFirst}`,
  )

  await page.screenshot({ path: join(SHOTS, 'desktop-flipped.png') })

  await firstCardInner.click()
  await page.waitForTimeout(800)
  const pressedAfterSecond = await firstCardInner.getAttribute('aria-pressed')
  const flipBackOnSecondClick =
    pressedAfterFirst === 'true' && pressedAfterSecond === 'false'
  recordCheck(
    'first_card_flips_back_on_second_click',
    flipBackOnSecondClick,
    `aria-pressed: ${pressedAfterFirst} → ${pressedAfterSecond}`,
  )

  await firstCardInner.click()
  await page.waitForTimeout(800)

  const congressLink = page.locator('.flip-card').first().locator('.congress-link')
  const href = await congressLink.getAttribute('href')
  const target = await congressLink.getAttribute('target')
  const hrefValid =
    !!href &&
    (href.startsWith('https://www.congress.gov/') ||
      href.startsWith('https://congress.gov/'))
  const targetBlank = target === '_blank'
  recordCheck(
    'congress_gov_link_valid',
    hrefValid && targetBlank,
    `href=${href ?? 'null'}, target=${target ?? 'null'}`,
  )

  const overflowCheck = await page.evaluate(() => {
    const card = document.querySelector('.flip-card')
    const backFace = card?.querySelector('.flip-card-back')
    const surface = backFace?.querySelector('.feed-card-surface')
    if (!card || !backFace || !surface) {
      return { ok: false, reason: 'missing elements' }
    }
    const cardRect = surface.getBoundingClientRect()
    const children = surface.querySelectorAll('*')
    let spillCount = 0
    for (const el of children) {
      const r = el.getBoundingClientRect()
      const tolerance = 2
      if (
        r.bottom > cardRect.bottom + tolerance ||
        r.top < cardRect.top - tolerance ||
        r.right > cardRect.right + tolerance ||
        r.left < cardRect.left - tolerance
      ) {
        spillCount++
      }
    }
    const backScroll = backFace.scrollHeight
    const cardHeight = surface.clientHeight
    return {
      ok: spillCount === 0,
      spillCount,
      backScrollHeight: backScroll,
      cardClientHeight: cardHeight,
      scrollExceeds: backScroll > cardHeight + 4,
    }
  })
  recordCheck(
    'back_face_no_visual_overflow',
    overflowCheck.ok,
    JSON.stringify(overflowCheck),
  )

  const secondCard = page.locator('.flip-card').nth(1)
  await secondCard.hover()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(SHOTS, 'desktop-hover.png') })

  await firstCardInner.evaluate((el) => {
    el.setAttribute('aria-pressed', 'false')
    el.classList.remove('is-flipped')
  })
  await page.evaluate(() => window.scrollTo(0, 0))

  const keyboardCard = page.locator('.flip-card').first().locator('.flip-card-inner')
  await keyboardCard.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  const pressedAfterEnter = await keyboardCard.getAttribute('aria-pressed')
  recordCheck(
    'keyboard_enter_flips_card',
    pressedAfterEnter === 'true',
    `aria-pressed after Enter: ${pressedAfterEnter}`,
  )

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: join(SHOTS, 'desktop-full.png'),
    fullPage: true,
  })

  await context.close()
}

async function captureMobile(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await waitForCards(page)

  await page.screenshot({ path: join(SHOTS, 'mobile-top.png') })

  const scrollWidth = await page.evaluate(
    () => document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth,
  )
  recordCheck(
    'no_horizontal_scrollbar_mobile',
    scrollWidth <= 390,
    `scrollWidth=${scrollWidth} (max 390)`,
  )

  const firstCardInner = page.locator('.flip-card').first().locator('.flip-card-inner')
  await firstCardInner.tap()
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(SHOTS, 'mobile-flipped.png') })

  await context.close()
}

async function main() {
  const browser = await chromium.launch({ headless: true })

  try {
    await captureDesktop(browser)
    await captureMobile(browser)
  } finally {
    await browser.close()
  }

  results.metadata.screenshotCount = 7
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
