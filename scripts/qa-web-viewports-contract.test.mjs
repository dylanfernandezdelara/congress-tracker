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
  assert.match(agents, /mobile/i)
  assert.match(agents, /desktop/i)
})

test('qa:web script is wired in package.json', () => {
  assert.equal(packageJson.scripts['qa:web'], 'node scripts/qa-web-viewports.mjs')
  assert.ok(fs.existsSync(qaScript))
})
