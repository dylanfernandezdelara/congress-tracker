import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { TEST_ONLY } from './verify-congress-tracker.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const helper = path.join(here, 'verify-congress-tracker')
const { parseArgs, parseName, isAllowedApiPath, resolveEvidencePath, seedFeedProblems, ENERGY_HEADLINE } =
  TEST_ONLY

test('helper wrapper is executable', () => {
  const stat = fs.statSync(helper)
  assert.ok((stat.mode & 0o111) !== 0)
})

test('usage documents selector, nth, and GET-only api', () => {
  try {
    execFileSync(helper, [], { encoding: 'utf8' })
    assert.fail('expected usage exit')
  } catch (err) {
    assert.equal(err.status, 2)
    const text = `${err.stdout ?? ''}${err.stderr ?? ''}`
    assert.match(text, /--selector/)
    assert.match(text, /--nth N/)
    assert.match(text, /api GET/)
    assert.match(text, /snapshot --aria --path/)
  }
})

test('parseName treats /pattern/ as a regex', () => {
  const flags = parseArgs(['--name', '/House passes a broad energy permitting/', '--nth', '0'])
  assert.equal(String(parseName(flags.name)), '/House passes a broad energy permitting/')
  assert.equal(flags.nth, '0')
})

test('api paths are read-only public JSON', () => {
  assert.equal(isAllowedApiPath('/feed/latest.json?limit=50&offset=0'), true)
  assert.equal(isAllowedApiPath('/stats/session.json'), true)
  assert.equal(isAllowedApiPath('/health'), true)
  assert.equal(isAllowedApiPath('/debug/ingest.json'), true)
  assert.equal(isAllowedApiPath('/__pipeline/run/feed'), false)
  assert.equal(isAllowedApiPath('/@fs/workers/senate_data_worker/.dev.vars'), false)
  assert.equal(isAllowedApiPath('/feed/../@fs/workers/senate_data_worker/.dev.vars'), false)
  assert.equal(isAllowedApiPath('https://example.com/feed'), false)
})

test('evidence paths cannot escape artifacts/verify', () => {
  const ok = resolveEvidencePath('artifacts/verify/feed-timeline/home.png')
  assert.equal(ok, path.join(TEST_ONLY.EVIDENCE_ROOT, 'feed-timeline', 'home.png'))
  assert.throws(() => resolveEvidencePath('/tmp/x.png'), /stay under artifacts\/verify/)
  assert.throws(() => resolveEvidencePath('../../.ssh/authorized_keys'), /stay under artifacts\/verify/)
})

test('seeded feed must include the required headlines; mixed live rows are a warning', () => {
  const sample = (headline) => ({ digest: { headline } })
  const items = TEST_ONLY.REQUIRED_HEADLINES.map(sample)
  assert.deepEqual(seedFeedProblems(items), { errors: [], warnings: [] })
  assert.deepEqual(seedFeedProblems([]), { errors: ['feed has no items'], warnings: [] })
  const mixed = seedFeedProblems([
    ...TEST_ONLY.REQUIRED_HEADLINES.map(sample),
    { digest: { headline: 'Live Act' } },
  ])
  assert.deepEqual(mixed.errors, [])
  assert.match(mixed.warnings[0], /mixed/)
  assert.match(
    seedFeedProblems([sample(ENERGY_HEADLINE), sample(TEST_ONLY.REQUIRED_HEADLINES[1])]).errors[0],
    /missing required sample headline/,
  )
})
