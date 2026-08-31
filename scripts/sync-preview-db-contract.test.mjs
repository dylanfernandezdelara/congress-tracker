import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  PRODUCTION_D1_NAME,
  PREVIEW_D1_NAME,
  chunkStatements,
  dropOversizedStatements,
  parseArgs,
  splitSqlStatements,
} from './d1-import-sql-chunks.mjs'

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
  assert.match(source, /d1-import-sql-chunks\.mjs/)
  assert.match(source, /--env preview/)
  assert.match(source, /DROP TABLE IF EXISTS/)
  assert.match(source, /_cf_KV/)
  assert.match(source, /sqlite_/)
  assert.doesNotMatch(source, /execute "\$\{PROD_DB_NAME\}"/)
  assert.doesNotMatch(source, /CONFIRM_PRODUCTION/)
})

test('chunk importer splits SQL and refuses production dest', () => {
  const statements = splitSqlStatements(
    'PRAGMA defer_foreign_keys=TRUE;\nINSERT INTO "votes" VALUES(1);\nCREATE INDEX idx_x ON votes (vote_date);\n',
  )
  assert.equal(statements.length, 3)
  const chunks = chunkStatements(statements, 2, 10_000)
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].length, 2)
  assert.equal(chunks[1].length, 1)

  const args = parseArgs([
    '--file',
    'dump.sql',
    '--database',
    PREVIEW_D1_NAME,
    '--env',
    'preview',
  ])
  assert.equal(args.database, PREVIEW_D1_NAME)
  assert.equal(PRODUCTION_D1_NAME, 'congress-tracker')

  const filtered = dropOversizedStatements(
    ['INSERT INTO votes VALUES (1);', 'x'.repeat(120_000) + ';'],
    100_000,
  )
  assert.deepEqual(filtered, ['INSERT INTO votes VALUES (1);'])
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
