import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedScript = path.join(rootDir, 'scripts', 'seed-executive-signal.sh')

function printSql() {
  return execFileSync('bash', [seedScript], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, SEED_PRINT_SQL: '1' },
  })
}

test('executive seed script exists and is executable', () => {
  const stat = fs.statSync(seedScript)
  assert.ok(stat.isFile())
  assert.ok((stat.mode & 0o111) !== 0, 'executive seed script should be executable')
})

test('executive seed SQL includes housing SAVE post and bill links', () => {
  const sql = execFileSync('bash', [seedScript], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, SEED_PRINT_SQL: '1' },
  })
  assert.match(sql, /CREATE TABLE IF NOT EXISTS executive_posts/)
  assert.match(sql, /116805545512296111/)
  assert.match(sql, /Cancelled housing signing until SAVE Act passes/)
  assert.match(sql, /119, 'HR', 6644/)
  assert.match(sql, /119, 'HR', 22/)
})
