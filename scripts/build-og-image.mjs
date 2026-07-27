#!/usr/bin/env node
/**
 * Render web/public/og-image.png (1200×630) from DESIGN_LANGUAGE.md tokens.
 *
 * Usage: node scripts/build-og-image.mjs
 * Requires: root playwright + Chromium (`npx playwright install chromium`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(rootDir, 'web', 'public', 'og-image.png')

const WIDTH = 1200
const HEIGHT = 630

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      background: #FAFAFA;
      color: #292929;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      letter-spacing: -0.15px;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
    }
    .card {
      flex: 1;
      margin: 48px;
      padding: 56px 64px;
      background: #FFFFFF;
      border: 1px solid #E5E5E5;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .eyebrow {
      font-size: 22px;
      font-weight: 500;
      color: #5D5D5D;
    }
    .title {
      font-size: 72px;
      font-weight: 500;
      line-height: 1.05;
      letter-spacing: -1.2px;
      margin-top: 28px;
    }
    .subtitle {
      font-size: 28px;
      font-weight: 400;
      color: #5D5D5D;
      line-height: 1.35;
      max-width: 920px;
      margin-top: 24px;
    }
    .footer {
      font-size: 22px;
      font-weight: 400;
      color: #9E9E9E;
      border-top: 1px solid #E5E5E5;
      padding-top: 28px;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <div class="eyebrow">trackcongress.org</div>
      <h1 class="title">Track Congress</h1>
      <p class="subtitle">Independent, unofficial plain-English passage votes from the House and Senate.</p>
    </div>
    <div class="footer">Not a U.S. government website</div>
  </div>
</body>
</html>`

async function main() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    })
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: outPath,
      type: 'png',
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    })
  } finally {
    await browser.close()
  }

  const stats = fs.statSync(outPath)
  console.log(`Wrote ${outPath} (${stats.size} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
