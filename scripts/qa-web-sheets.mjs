#!/usr/bin/env node
/**
 * Sheet QA in real browsers (Chromium and WebKit). jsdom unit tests cannot see layout, animation, focus timing or
 * engine differences, so this drives the running app and asserts the sheet behaviors people rely on:
 * close by Escape, Close button and backdrop; stacked sheets close from the top; focus returns to the opener;
 * Escape in the filter's member field clears the field before it closes the sheet; the sheet is bottom-docked on
 * phones and centered on wider screens; it enters on the drawer curve over 500ms; it takes dark colors in the dark theme.
 * The desktop filters panel (not a sheet) expands over 200ms and leaves the member suggestions unclipped.
 *
 * Needs the local stack with seeded data (npm run seed, dev:worker, dev:web).
 * Env: QA_WEB_URL (default http://127.0.0.1:5173). Exits 1 on any failure. WebKit is skipped if not installed.
 */
const baseUrl = process.env.QA_WEB_URL ?? 'http://127.0.0.1:5173'

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    console.error('Playwright is required for sheet QA. Run: npm install && npx playwright install chromium webkit')
    process.exit(1)
  }
}

const openDialogs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role=dialog]')]
      .filter((d) => !d.hasAttribute('inert'))
      .map((d) => document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ?? '?'),
  )

/** Waits until no sheet is mid-transition, so measurements see its resting position. */
async function waitForSheetsToSettle(page) {
  await page.waitForFunction(
    () => {
      const sheets = [...document.querySelectorAll('[data-slot=sheet]')]
      const open = sheets.length > 0 && sheets.every((el) => el.hasAttribute('data-open') && !el.hasAttribute('data-starting-style'))
      const moving = document.getAnimations().some((a) => a.effect?.target?.closest?.('[data-slot=sheet]') && a.playState === 'running')
      return open && !moving
    },
    null,
    { timeout: 3000 },
  )
}

/** Waits until every sheet has finished closing and left the page (an inert sheet is still animating out). */
async function waitForAllClosed(page) {
  await page.waitForFunction(() => document.querySelectorAll('[data-slot=sheet]').length === 0, null, { timeout: 3000 })
}

async function waitForDialogs(page, count) {
  await page.waitForFunction((n) => [...document.querySelectorAll('[role=dialog]')].filter((d) => !d.hasAttribute('inert')).length === n, count, { timeout: 3000 })
}

const checks = [
  {
    name: 'member sheet closes on Escape, Close and backdrop, and returns focus',
    viewport: { width: 1280, height: 800 },
    async run(page) {
      const trigger = page.locator('.member-profile-trigger').first()
      for (const close of ['Escape', 'Close', 'backdrop']) {
        // Open by keyboard: WebKit does not focus a button on click, and focus return means the same in both engines.
        await trigger.focus()
        await page.keyboard.press('Enter')
        await waitForDialogs(page, 1)
        await page.waitForFunction(() => document.activeElement?.closest('[role=dialog]'))
        if (close === 'Escape') await page.keyboard.press('Escape')
        if (close === 'Close') await page.getByRole('button', { name: 'Close', exact: true }).click()
        if (close === 'backdrop') await page.mouse.click(10, 400)
        await waitForAllClosed(page)
        const focusBack = await trigger.evaluate((el) => el === document.activeElement)
        if (!focusBack) throw new Error(`focus did not return to the opener after ${close}`)
      }
    },
  },
  {
    name: 'stacked sheets close from the top',
    viewport: { width: 1280, height: 800 },
    async run(page) {
      await page.locator('.tightness-bar-row').first().click()
      await waitForDialogs(page, 1)
      const name = page.locator('[role=dialog] .member-profile-trigger').first()
      await name.click()
      await waitForDialogs(page, 2)
      await page.waitForFunction(() => {
        const ds = [...document.querySelectorAll('[role=dialog]')]
        return ds.length === 2 && ds[1].contains(document.activeElement)
      })
      const [bottom, top] = await openDialogs(page)
      await page.keyboard.press('Escape')
      await waitForDialogs(page, 1)
      const left = await openDialogs(page)
      if (left[0] !== bottom) throw new Error(`Escape closed "${top}"'s sheet? left open: ${JSON.stringify(left)}, expected "${bottom}"`)
      await page.keyboard.press('Escape')
      await waitForDialogs(page, 0)
    },
  },
  {
    name: 'phone: filter field keeps Escape until it is empty; sheet is bottom-docked',
    viewport: { width: 390, height: 844 },
    async run(page) {
      await page.getByRole('button', { name: 'Filters' }).click()
      await waitForDialogs(page, 1)
      await waitForSheetsToSettle(page)
      const box = await page.locator('[role=dialog]').boundingBox()
      if (Math.abs(box.y + box.height - 844) > 1) throw new Error(`sheet bottom at ${box.y + box.height}, expected 844`)
      const field = page.locator('[role=dialog]').getByPlaceholder('Name or last name')
      await field.fill('Sand')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
      if ((await field.inputValue()) !== '') throw new Error('Escape did not clear the member field')
      if ((await openDialogs(page)).length !== 1) throw new Error('Escape in the member field closed the sheet')
      await page.keyboard.press('Escape')
      await waitForDialogs(page, 0)
    },
  },
  {
    name: 'dark theme: the sheet and the selected segment are dark-mode colors',
    viewport: { width: 1280, height: 800 },
    theme: 'dark',
    async run(page) {
      // Lightness of a computed color, 0 to 1, through canvas so oklch and rgb read the same.
      const lightness = (locator, prop) =>
        locator.evaluate((el, p) => {
          const ctx = document.createElement('canvas').getContext('2d')
          ctx.fillStyle = getComputedStyle(el)[p]
          ctx.fillRect(0, 0, 1, 1)
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
          return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        }, prop)
      const selected = page.locator('[aria-label="Filter by chamber"] [aria-checked=true]')
      if ((await lightness(selected, 'color')) < 0.5) throw new Error('selected chamber text is dark on the dark page')
      await page.locator('.member-profile-trigger').first().click()
      await waitForDialogs(page, 1)
      await waitForSheetsToSettle(page)
      const bg = await lightness(page.locator('[data-slot=sheet]'), 'backgroundColor')
      if (bg > 0.3) throw new Error(`sheet background lightness ${bg.toFixed(2)} in dark theme`)
    },
  },
  {
    name: 'desktop filters expand over 200ms and do not clip the member suggestions',
    viewport: { width: 1280, height: 800 },
    async run(page) {
      await page.locator('.feed-advanced-filters-toggle').click()
      // The transition registers a frame or two after the click; poll for it.
      const duration = await page
        .waitForFunction(() => {
          const el = document.querySelector('[data-slot=collapsible-content]')
          const a = document.getAnimations().find((x) => x.effect?.target === el && x.transitionProperty === 'height')
          return a ? a.effect.getTiming().duration : false
        }, null, { timeout: 1000, polling: 'raf' })
        .then((h) => h.jsonValue())
        .catch(() => null)
      if (Math.round(duration ?? 0) !== 200) throw new Error(`filters panel height transition ${duration}ms, expected 200`)
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-slot=collapsible-content]')
        return el && !el.hasAttribute('data-moving') && getComputedStyle(el).overflow === 'visible'
      }, null, { timeout: 3000 })
      await page.locator('[data-slot=collapsible-content]').getByPlaceholder('Name or last name').fill('Sa')
      const option = page.locator('.feed-member-suggestions [role=option]').first()
      await option.waitFor({ timeout: 3000 })
      const box = await option.boundingBox()
      const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.feed-member-suggestions'), { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      if (!hit) throw new Error('member suggestions are hidden or clipped')
      await page.keyboard.press('Escape')
      await page.locator('.feed-advanced-filters-toggle').click()
      await page.waitForFunction(() => !document.querySelector('[data-slot=collapsible-content]'), null, { timeout: 3000 })
    },
  },
  {
    name: 'desktop: sheet is centered and enters over 500ms on the drawer curve',
    viewport: { width: 1280, height: 800 },
    async run(page) {
      await page.evaluate(() => {
        window.__sheetMotion = []
        const t0 = performance.now()
        const tick = () => {
          for (const a of document.getAnimations()) {
            if (a.effect?.target?.getAttribute?.('data-slot') === 'sheet') {
              window.__sheetMotion.push({ property: a.transitionProperty, duration: a.effect.getTiming().duration, easing: getComputedStyle(a.effect.target).transitionTimingFunction })
            }
          }
          if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.locator('.member-profile-trigger').first().click()
      await waitForDialogs(page, 1)
      await page.waitForTimeout(900)
      const motion = await page.evaluate(() => window.__sheetMotion.find((m) => m.property === 'transform'))
      if (!motion) throw new Error('no transform transition on the sheet')
      if (Math.round(motion.duration) !== 500) throw new Error(`sheet entered over ${motion.duration}ms, expected 500`)
      if (!motion.easing.includes('0.32, 0.72, 0, 1')) throw new Error(`sheet easing ${motion.easing}, expected the drawer curve`)
      await waitForSheetsToSettle(page)
      const box = await page.locator('[role=dialog]').boundingBox()
      const offCenter = Math.abs(box.y + box.height / 2 - 400)
      if (offCenter > 2) throw new Error(`sheet is ${offCenter}px off vertical center`)
    },
  },
]

async function main() {
  const playwright = await loadPlaywright()
  let failures = 0
  for (const engine of ['chromium', 'webkit']) {
    let browser
    try {
      browser = await playwright[engine].launch()
    } catch {
      console.log(`  [SKIP] ${engine} not installed (npx playwright install ${engine})`)
      continue
    }
    for (const check of checks) {
      const page = await browser.newPage({ viewport: check.viewport })
      if (check.theme) await page.addInitScript((t) => localStorage.setItem('theme', t), check.theme)
      try {
        await page.goto(baseUrl, { waitUntil: 'load' })
        await page.locator('.member-profile-trigger').first().waitFor()
        await check.run(page)
        console.log(`  [PASS] ${engine} / ${check.name}`)
      } catch (error) {
        failures += 1
        console.log(`  [FAIL] ${engine} / ${check.name}: ${error.message.split('\n')[0]}`)
      }
      await page.close()
    }
    await browser.close()
  }
  console.log(failures ? `Sheet QA: ${failures} failed` : 'Sheet QA: all passed')
  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
