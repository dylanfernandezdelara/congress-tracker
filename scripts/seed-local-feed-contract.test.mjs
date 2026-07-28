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
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bill_lifecycle/)
  assert.match(sql, /INSERT OR REPLACE INTO votes/)
  assert.match(sql, /INSERT OR REPLACE INTO bill_digests/)
  assert.match(sql, /INSERT OR REPLACE INTO bill_lifecycle/)
  assert.match(sql, /'signed'/)
  assert.match(sql, /'law_unsigned'/)
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
  const digests = [...sql.matchAll(/'(\{"headline".*?\})'/g)].map((m) => m[1])
  assert.ok(digests.length >= 3, 'expected at least three seeded digests')
  for (const raw of digests) {
    const digest = JSON.parse(raw)
    assert.equal(typeof digest.headline, 'string')
    assert.equal(typeof digest.what_it_does, 'string')
    assert.ok(Array.isArray(digest.key_points))
    assert.ok(Array.isArray(digest.terms_explained))
  }
})

test('seeded data is clearly marked as a local sample', () => {
  const sql = printSql()
  assert.match(sql, /local sample/)
})
