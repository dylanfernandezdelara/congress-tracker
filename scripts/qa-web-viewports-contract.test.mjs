import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const agents = fs.readFileSync(path.join(rootDir, 'AGENTS.md'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const qaScript = path.join(rootDir, 'scripts', 'qa-web-viewports.mjs')

test('AGENTS.md requires viewport QA for web UI PRs', () => {
  assert.match(agents, /qa:web/)
  assert.match(agents, /iPhone SE/i)
  assert.match(agents, /desktop/i)
  assert.match(agents, /16 checks/)
  assert.match(agents, /\/stats/)
})

test('qa:web script is wired in package.json', () => {
  assert.equal(packageJson.scripts['qa:web'], 'node scripts/qa-web-viewports.mjs')
  assert.ok(fs.existsSync(qaScript))
})

test('AGENTS.md requires thermonuclear review before shipping', () => {
  assert.match(agents, /thermonuclear review/i)
})

test('cursor-cloud setup installs root QA tooling', () => {
  const setup = fs.readFileSync(path.join(rootDir, 'scripts', 'cursor-cloud-setup.sh'), 'utf8')
  assert.match(setup, /npm --prefix "\$\{ROOT_DIR\}" ci/)
  assert.match(setup, /playwright install chromium/)
})

test('Cursor rules document agent-driven viewport QA and review', () => {
  const viewportRule = fs.readFileSync(
    path.join(rootDir, '.cursor', 'rules', 'pr-viewport-qa.mdc'),
    'utf8',
  )
  const reviewRule = fs.readFileSync(
    path.join(rootDir, '.cursor', 'rules', 'pr-thermonuclear-review.mdc'),
    'utf8',
  )
  assert.match(viewportRule, /qa:web/)
  assert.match(reviewRule, /thermonuclear review/i)
})

test('AGENTS.md keeps ship checklist in Cursor, not GitHub Actions', () => {
  assert.match(agents, /Cursor Cloud ship checklist/i)
  assert.match(agents, /not GitHub Actions/i)
  const ci = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.doesNotMatch(ci, /viewport-qa:/)
  assert.doesNotMatch(ci, /qa:web/)
})

test('dev:web forwards Vite CLI flags through nested npm', () => {
  // Without the trailing `--`, `npm run dev:web -- --host …` becomes
  // `vite 127.0.0.1 5173` (positional junk) instead of `vite --host …`.
  assert.equal(packageJson.scripts['dev:web'], 'npm --prefix web run dev --')
})

test('Vite binds 127.0.0.1:5173 with strictPort (docs/agent healthchecks)', () => {
  const viteConfig = fs.readFileSync(path.join(rootDir, 'web', 'vite.config.ts'), 'utf8')
  assert.match(viteConfig, /host:\s*'127\.0\.0\.1'/)
  assert.match(viteConfig, /port:\s*5173/)
  assert.match(viteConfig, /strictPort:\s*true/)
})

test('qa:web defaults to IPv4 loopback URL', () => {
  const qa = fs.readFileSync(qaScript, 'utf8')
  assert.match(qa, /QA_WEB_URL \?\? 'http:\/\/127\.0\.0\.1:5173'/)
})

test('qa:web covers home and /stats across the viewport/theme matrix', () => {
  const qa = fs.readFileSync(qaScript, 'utf8')
  assert.match(qa, /auditHomePage/)
  assert.match(qa, /auditStatsPage/)
  assert.match(qa, /\/stats/)
  assert.match(qa, /Federal Control/)
  assert.match(qa, /federal-control section/)
  assert.match(qa, /\$\{caseId\}-stats\.png/)
  // Both route audits must run inside the viewport×theme loop (16 results).
  assert.match(qa, /const homeAudit = await auditHomePage\(page\)/)
  assert.match(qa, /const statsAudit = await auditStatsPage\(page\)/)
  // Home checks remain (feed row + brand heading).
  assert.match(qa, /Plain headline for readers/)
  assert.match(qa, /\.feed-row/)
  assert.match(qa, /Congress Tracker/)
})

test('viewport QA rule expects home+stats matrix coverage', () => {
  const viewportRule = fs.readFileSync(
    path.join(rootDir, '.cursor', 'rules', 'pr-viewport-qa.mdc'),
    'utf8',
  )
  assert.match(viewportRule, /16\/16/)
  assert.match(viewportRule, /\/stats/)
})
