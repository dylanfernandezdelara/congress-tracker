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
  const sql = printSql()
  assert.match(sql, /CREATE TABLE IF NOT EXISTS executive_posts/)
  assert.match(sql, /116805545512296111/)
  assert.match(sql, /Cancelled housing signing until SAVE Act passes/)
  assert.match(sql, /119, 'HR', 6644/)
  assert.match(sql, /119, 'HR', 22/)
})

test('executive seed --remote requires CONFIRM_PRODUCTION_SEED=1', () => {
  let threw = false
  try {
    execFileSync('bash', [seedScript, '--remote'], {
      cwd: rootDir,
      encoding: 'utf8',
      // Strip Cloudflare credentials so a guard regression can never reach the
      // real remote D1 from a test run.
      env: {
        ...process.env,
        CONFIRM_PRODUCTION_SEED: undefined,
        CLOUDFLARE_API_TOKEN: '',
        CLOUDFLARE_ACCOUNT_ID: '',
      },
    })
  } catch (err) {
    threw = true
    const error = /** @type {{ status?: number, stderr?: string }} */ (err)
    assert.equal(error.status, 1)
    assert.match(String(error.stderr ?? ''), /PRODUCTION D1 database 'congress-tracker'/)
    assert.match(String(error.stderr ?? ''), /CONFIRM_PRODUCTION_SEED=1/)
  }
  assert.ok(threw, 'expected --remote without confirm to exit non-zero')
})

test('executive seed script documents production confirm for --remote', () => {
  const source = fs.readFileSync(seedScript, 'utf8')
  assert.match(source, /CONFIRM_PRODUCTION_SEED/)
  assert.match(source, /PRODUCTION D1 database/)
  assert.doesNotMatch(source, /shared binding/)
})
