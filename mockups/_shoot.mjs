import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(dir, '../artifacts/mockup-shots')
fs.mkdirSync(outDir, { recursive: true })

const pages = [
  { id: 'index', file: 'index.html' },
  { id: 'a-briefing', file: 'direction-a-briefing.html' },
  { id: 'b-signal-feed', file: 'direction-b-signal-feed.html' },
  { id: 'c-impact-first', file: 'direction-c-impact-first.html' },
]
const viewports = [
  { id: 'mobile', width: 390, height: 844 },
  { id: 'desktop', width: 1280, height: 900 },
]
const themes = ['light', 'dark']

const browser = await chromium.launch()
let problems = 0
for (const pg of pages) {
  const url = pathToFileURL(path.join(dir, pg.file)).href
  for (const vp of viewports) {
    for (const theme of themes) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await ctx.newPage()
      const errors = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      await page.waitForTimeout(250)
      const bodyText = await page.evaluate(() => document.body.innerText)
      const hasInsulin = bodyText.includes('insulin') || bodyText.includes('$35')
      const file = `${pg.id}_${vp.id}_${theme}.png`
      await page.screenshot({ path: path.join(outDir, file), fullPage: true })
      const flag = errors.length || (pg.id !== 'index' && !hasInsulin) ? ' <-- CHECK' : ''
      if (flag) problems++
      console.log(`${file}  errors=${errors.length}  content=${pg.id === 'index' ? 'n/a' : hasInsulin}${flag}`)
      if (errors.length) console.log('   ', errors.slice(0, 3).join(' | '))
      await ctx.close()
    }
  }
}
await browser.close()
console.log(problems ? `\n${problems} page(s) need attention` : '\nAll pages rendered cleanly')
