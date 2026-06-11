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
