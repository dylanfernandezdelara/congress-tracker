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
  dropUserTablesSql,
  dumpTableInsertCount,
  dumpVotesLatest,
  filterDumpStatements,
  isRetryableD1Error,
  parseWorkerD1Config,
  planSync,
  splitSqlStatements,
} from './sync-preview-db.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(rootDir, 'scripts', 'sync-preview-db.mjs')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const workerToml = fs.readFileSync(
  path.join(rootDir, 'workers', 'senate_data_worker', 'wrangler.toml'),
  'utf8',
)
const agents = fs.readFileSync(path.join(rootDir, 'AGENTS.md'), 'utf8')

function dryRun() {
  return execFileSync(process.execPath, [script], {
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

test('sync:preview-db is a single Node entrypoint', () => {
  assert.equal(packageJson.scripts['sync:preview-db'], 'node scripts/sync-preview-db.mjs')
  assert.ok(fs.existsSync(script))
  assert.equal(fs.existsSync(path.join(rootDir, 'scripts', 'sync-preview-db.sh')), false)
  assert.equal(fs.existsSync(path.join(rootDir, 'scripts', 'd1-import-sql-chunks.mjs')), false)
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
  assert.match(out, /SYNC_PREVIEW_DB_DUMP/)
  assert.doesNotMatch(out, /d1 execute congress-tracker /)
})

test('script execute paths never target production and require preview env', () => {
  const source = fs.readFileSync(script, 'utf8')
  assert.match(source, /'d1',\s*'export',\s*PRODUCTION_D1_NAME/)
  assert.match(source, /'d1',\s*'execute',\s*PREVIEW_D1_NAME/)
  assert.match(source, /'--env',\s*'preview'/)
  assert.doesNotMatch(source, /startChunk|start-chunk/)
  assert.match(source, /spawnSync/)
  assert.match(source, /senate_vote_menu_cache_/)
})

test('planSync ids match wrangler.toml and differ from each other', () => {
  const cfg = planSync(workerToml)
  const parsed = parseWorkerD1Config(workerToml)
  assert.equal(cfg.productionName, PRODUCTION_D1_NAME)
  assert.equal(cfg.previewName, PREVIEW_D1_NAME)
  assert.equal(cfg.productionId, parsed.productionId)
  assert.equal(cfg.previewId, parsed.previewId)
  assert.notEqual(cfg.productionId, cfg.previewId)
  const out = dryRun()
  assert.match(out, new RegExp(cfg.productionId))
  assert.match(out, new RegExp(cfg.previewId))
})

test('SQL split, chunk, dump vote stats, and drop SQL keep system tables', () => {
  const statements = splitSqlStatements(
    'PRAGMA defer_foreign_keys=TRUE;\nINSERT INTO "votes" ("vote_date") VALUES(\'2026-08-08\');\nINSERT INTO "member_votes" VALUES(1);\nCREATE INDEX idx_x ON votes (vote_date);\n',
  )
  assert.equal(statements.length, 4)
  assert.equal(dumpTableInsertCount(statements, 'votes'), 1)
  assert.equal(dumpTableInsertCount(statements, 'member_votes'), 1)
  assert.equal(dumpVotesLatest(statements), '2026-08-08')
  const chunks = chunkStatements(statements, 2, 10_000)
  assert.equal(chunks.length, 2)
  const drop = dropUserTablesSql(['votes', '_cf_KV', 'sqlite_sequence', 'bill_floor_events'])
  assert.match(drop, /DROP TABLE IF EXISTS "votes"/)
  assert.match(drop, /DROP TABLE IF EXISTS "bill_floor_events"/)
  assert.doesNotMatch(drop, /_cf_KV/)
  assert.doesNotMatch(drop, /sqlite_sequence/)
})

test('filterDumpStatements skips only the senate vote-menu cache row', () => {
  const menu = `INSERT INTO "pipeline_state" ("key","value_json","updated_at") VALUES('senate_vote_menu_cache_119_2','${'x'.repeat(120_000)}','2026-08-08');`
  const filtered = filterDumpStatements([
    'INSERT INTO "votes" VALUES(1);',
    menu,
  ])
  assert.equal(filtered.skippedMenu, 1)
  assert.deepEqual(filtered.statements, ['INSERT INTO "votes" VALUES(1);'])

  assert.throws(
    () => filterDumpStatements([`${'INSERT INTO "bill_digests" VALUES(\''}${'y'.repeat(120_000)}');`]),
    /Refusing oversized SQL/,
  )
})

test('isRetryableD1Error sees D1_RESET_DO on captured stderr', () => {
  const inheritedOnly = 'Command failed: wrangler.js d1 execute congress-tracker-preview --file chunk.sql'
  assert.equal(isRetryableD1Error(inheritedOnly), false)
  assert.equal(isRetryableD1Error(`${inheritedOnly}\n{"D1_RESET_DO":true}`), true)
  assert.equal(isRetryableD1Error('D1 reset before execute completed!'), true)
})

test('AGENTS.md does not export production D1 on every preview upload', () => {
  const checklist = agents.split('### Cursor Cloud ship checklist')[1].split('### Production deploys')[0]
  assert.match(checklist, /npm run preview/)
  assert.doesNotMatch(checklist, /Then `npm run sync:preview-db`/)
  assert.match(agents, /npm run seed/)
  assert.match(agents, /sync:preview-db/)
})
