import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rootDir, 'web', 'public')
const robotsPath = path.join(publicDir, 'robots.txt')
const headersPath = path.join(publicDir, '_headers')
const ogImagePath = path.join(publicDir, 'og-image.png')
const indexHtmlPath = path.join(rootDir, 'web', 'index.html')
const docsPath = path.join(rootDir, 'docs', 'DOMAIN_AND_DNS.md')
const ogScriptPath = path.join(rootDir, 'scripts', 'build-og-image.mjs')
const sharedHeadersPath = path.join(rootDir, 'shared', 'security-headers.ts')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

/** Parse `"Header-Name": "value"` pairs from shared/security-headers.ts. */
function loadSharedSecurityHeaders() {
  const src = fs.readFileSync(sharedHeadersPath, 'utf8')
  const headers = {}
  for (const match of src.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    headers[match[1]] = match[2]
  }
  assert.ok(Object.keys(headers).length >= 5, 'shared/security-headers.ts must define security headers')
  return headers
}

test('robots.txt disallows /debug and /__pipeline/', () => {
  const robots = fs.readFileSync(robotsPath, 'utf8')
  assert.match(robots, /User-agent:\s*\*/i)
  assert.match(robots, /Allow:\s*\//)
  assert.match(robots, /Disallow:\s*\/debug/)
  assert.match(robots, /Disallow:\s*\/__pipeline\//)
})

test('_headers matches shared/security-headers.ts and noindexes /debug + workers.dev', () => {
  const shared = loadSharedSecurityHeaders()
  const headers = fs.readFileSync(headersPath, 'utf8')

  for (const [name, value] of Object.entries(shared)) {
    assert.match(
      headers,
      new RegExp(`${name}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      `_headers missing ${name}: ${value}`,
    )
  }

  assert.match(headers, /\/debug\*/)
  assert.match(headers, /X-Robots-Tag:\s*noindex/)
  assert.match(headers, /https:\/\/:version\.:subdomain\.workers\.dev\/\*/)
  assert.match(headers, /shared\/security-headers\.ts/)
})

test('index.html has canonical, Open Graph, and Twitter Card tags', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8')
  assert.match(html, /rel="canonical"\s+href="https:\/\/trackcongress\.org\/"/)
  assert.match(html, /property="og:site_name"\s+content="Track Congress"/)
  assert.match(html, /property="og:image"\s+content="https:\/\/trackcongress\.org\/og-image\.png"/)
  assert.match(html, /property="og:image:width"\s+content="1200"/)
  assert.match(html, /property="og:image:height"\s+content="630"/)
  assert.match(html, /name="twitter:card"\s+content="summary_large_image"/)
  assert.match(html, /name="twitter:image"\s+content="https:\/\/trackcongress\.org\/og-image\.png"/)
})

test('og-image.png exists and build script is present', () => {
  assert.ok(fs.existsSync(ogImagePath), 'web/public/og-image.png must exist')
  const stats = fs.statSync(ogImagePath)
  assert.ok(stats.size > 1000, `og-image.png too small (${stats.size} bytes)`)
  assert.ok(fs.existsSync(ogScriptPath), 'scripts/build-og-image.mjs must exist')
})

test('DOMAIN_AND_DNS.md documents www redirect and SPF/DMARC', () => {
  const docs = fs.readFileSync(docsPath, 'utf8')
  assert.match(docs, /www\.trackcongress\.org/)
  assert.match(docs, /v=spf1 -all/)
  assert.match(docs, /v=DMARC1;\s*p=reject/)
  assert.match(docs, /Redirect Rules/)
})

test('domain-assets contract is wired into npm test', () => {
  assert.match(packageJson.scripts.test, /domain-assets-contract\.test\.mjs/)
})
