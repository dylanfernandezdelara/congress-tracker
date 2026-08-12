import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedScript = path.join(rootDir, 'scripts', 'seed-local-feed.sh')

function printSql() {
  return execFileSync('bash', [seedScript], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, SEED_PRINT_SQL: '1' },
  })
}

test('seed script exists and is executable', () => {
  const stat = fs.statSync(seedScript)
  assert.ok(stat.isFile())
  assert.ok((stat.mode & 0o111) !== 0, 'seed script should be executable')
})

test('SEED_PRINT_SQL emits schema and idempotent inserts without running wrangler', () => {
  const sql = printSql()
  assert.match(sql, /CREATE TABLE IF NOT EXISTS votes/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bill_digests/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bill_sponsors/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bill_lifecycle/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS nominations/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS confirmation_votes/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bill_committee_events/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bill_process_state/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS committee_roster/)
  assert.match(sql, /INSERT OR REPLACE INTO votes/)
  assert.match(sql, /INSERT OR REPLACE INTO bill_digests/)
  assert.match(sql, /INSERT OR REPLACE INTO bill_sponsors/)
  assert.match(sql, /LOCAL:H002', 'NY'/)
  assert.match(sql, /INSERT OR REPLACE INTO bill_lifecycle/)
  assert.match(sql, /INSERT OR REPLACE INTO nominations/)
  assert.match(sql, /INSERT OR REPLACE INTO confirmation_votes/)
  assert.match(sql, /INSERT INTO bill_committee_events/)
  assert.match(sql, /INSERT INTO bill_process_state/)
  assert.match(sql, /INSERT OR REPLACE INTO committee_roster/)
  assert.match(sql, /'signed'/)
  assert.match(sql, /'law_unsigned'/)
  assert.match(sql, /On the Nomination/)
})

test('seed clears real roster so LOCAL left-rail spotlights stay visible', () => {
  const sql = printSql()
  assert.match(sql, /DELETE FROM members WHERE bioguide_id NOT LIKE 'LOCAL:%'/)
  assert.match(sql, /DELETE FROM member_cross_votes WHERE bioguide_id NOT LIKE 'LOCAL:%'/)
  assert.match(sql, /DELETE FROM financial_transactions WHERE bioguide_id LIKE 'LOCAL:%'/)
  assert.match(sql, /INSERT OR REPLACE INTO member_cross_votes/)
  assert.match(sql, /INSERT OR REPLACE INTO portfolio_snapshots/)
  assert.match(sql, /LOCAL:H001/)
  assert.match(sql, /LOCAL:S001/)
  assert.match(sql, /LOCAL:H003/)
  assert.match(sql, /LOCAL:H004/)
})

test('seeded votes use recent (lookback-window) dates, not stale literals', () => {
  const sql = printSql()
  const dates = [...sql.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1])
  assert.ok(dates.length >= 3, 'expected at least three seeded vote dates')

  const lookbackDays = 45
  const now = Date.now()
  for (const date of dates) {
    const ageDays = (now - Date.parse(`${date}T00:00:00.000Z`)) / 86_400_000
    assert.ok(ageDays >= 0, `seed date ${date} should not be in the future`)
    assert.ok(
      ageDays < lookbackDays,
      `seed date ${date} (${Math.round(ageDays)}d old) must fall inside the ${lookbackDays}-day feed lookback`,
    )
  }
})

test('seed digests are valid JSON matching the feed digest contract', () => {
  const sql = printSql()
  const digests = [...sql.matchAll(/'(\{"headline".*?\})'/g)]
    .map((m) => m[1])
    .map((raw) => JSON.parse(raw))
    .filter((digest) => typeof digest.what_it_does === 'string')
  assert.ok(digests.length >= 3, 'expected at least three seeded digests')
  for (const digest of digests) {
    assert.equal(typeof digest.headline, 'string')
    assert.equal(typeof digest.what_it_does, 'string')
    assert.ok(Array.isArray(digest.key_points))
    assert.ok(Array.isArray(digest.terms_explained))
  }
})

test('seed confirmations include background JSON matching the confirmations contract', () => {
  const sql = printSql()
  const backgrounds = [...sql.matchAll(/'(\{"headline".*?\})'/g)]
    .map((m) => m[1])
    .map((raw) => JSON.parse(raw))
    .filter((digest) => typeof digest.what_was_confirmed === 'string')
  assert.ok(backgrounds.length >= 2, 'expected at least two seeded confirmation backgrounds')
  for (const background of backgrounds) {
    assert.equal(typeof background.headline, 'string')
    assert.equal(typeof background.what_was_confirmed, 'string')
    assert.equal(typeof background.background, 'string')
    assert.ok(Array.isArray(background.key_points))
    assert.ok('wikipedia_url' in background)
    assert.ok('wikipedia_extract' in background)
  }
})

test('seeded data is clearly marked as a local sample', () => {
  const sql = printSql()
  assert.match(sql, /local sample/)
})
