import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(rootDir, 'scripts', 'sync-preview-db.sh')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const workerToml = fs.readFileSync(
  path.join(rootDir, 'workers', 'senate_data_worker', 'wrangler.toml'),
  'utf8',
)

function dryRun() {
  return execFileSync('bash', [script], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      SYNC_PREVIEW_DB_DRY_RUN: '1',
      CLOUDFLARE_API_TOKEN: '',
      CLOUDFLARE_ACCOUNT_ID: '',
    },
  })
}

test('sync-preview-db script exists and is executable', () => {
  const stat = fs.statSync(script)
  assert.ok(stat.isFile())
  assert.ok((stat.mode & 0o111) !== 0, 'sync-preview-db.sh should be executable')
})

test('sync:preview-db is wired in package.json', () => {
  assert.equal(packageJson.scripts['sync:preview-db'], './scripts/sync-preview-db.sh')
})

test('dry run documents export-only production and preview write target', () => {
  const out = dryRun()
  assert.match(out, /congress-tracker \(/)
  assert.match(out, /congress-tracker-preview \(/)
  assert.match(out, /export only/)
  assert.match(out, /write only/)
  assert.match(out, /production is never executed against for writes/)
  assert.match(out, /DRY RUN/)
  assert.match(out, /--env preview/)
  assert.doesNotMatch(out, /d1 execute congress-tracker /)
})

test('script refuses to write production and keeps Cloudflare system tables', () => {
  const source = fs.readFileSync(script, 'utf8')
  assert.match(source, /d1 export "\$\{PROD_DB_NAME\}"/)
  assert.match(source, /execute "\$\{PREVIEW_DB_NAME\}"/)
  assert.match(source, /--env preview/)
  assert.match(source, /DROP TABLE IF EXISTS/)
  assert.match(source, /_cf_KV/)
  assert.match(source, /sqlite_/)
  assert.doesNotMatch(source, /execute "\$\{PROD_DB_NAME\}"/)
  assert.doesNotMatch(source, /CONFIRM_PRODUCTION/)
})

test('script ids match wrangler.toml production vs preview D1', () => {
  const out = dryRun()
  const prodId = workerToml.match(
    /\[\[d1_databases\]\][\s\S]*?^database_id\s*=\s*"([^"]+)"/m,
  )?.[1]
  const previewId = workerToml.match(
    /\[\[env\.preview\.d1_databases\]\][\s\S]*?^database_id\s*=\s*"([^"]+)"/m,
  )?.[1]
  assert.ok(prodId)
  assert.ok(previewId)
  assert.notEqual(prodId, previewId)
  assert.match(out, new RegExp(prodId))
  assert.match(out, new RegExp(previewId))
})
