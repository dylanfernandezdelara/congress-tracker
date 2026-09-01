#!/usr/bin/env node
/**
 * Copy production D1 into isolated preview D1 so preview URLs show current
 * votes. Production is export-only. Preview is the only execute/write target.
 *
 * Remote export briefly makes production D1 unavailable — do not run on every
 * preview upload. Reuse SYNC_PREVIEW_DB_DUMP to retry without re-exporting.
 *
 * Usage:
 *   npm run sync:preview-db
 *   SYNC_PREVIEW_DB_DRY_RUN=1 npm run sync:preview-db
 *   SYNC_PREVIEW_DB_DUMP=/tmp/dump.sql npm run sync:preview-db
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRODUCTION_D1_NAME = 'congress-tracker'
export const PREVIEW_D1_NAME = 'congress-tracker-preview'
export const DEFAULT_CHUNK_STATEMENTS = 250
export const DEFAULT_CHUNK_BYTES = 90_000
export const DEFAULT_RETRIES = 8
export const DEFAULT_MAX_STATEMENT_BYTES = 100_000
export const SKIPPABLE_OVERSIZED = /INSERT INTO "pipeline_state".*senate_vote_menu_cache_/s

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workerDir = path.join(repoRoot, 'workers', 'senate_data_worker')
const workerTomlPath = path.join(workerDir, 'wrangler.toml')

export function parseWorkerD1Config(toml) {
  const d1Match = toml.match(
    /\[\[d1_databases\]\][\s\S]*?^binding\s*=\s*"([^"]+)"[\s\S]*?^database_name\s*=\s*"([^"]+)"[\s\S]*?^database_id\s*=\s*"([^"]+)"[\s\S]*?^preview_database_id\s*=\s*"([^"]+)"/m,
  )
  const previewMatch = toml.match(
    /\[\[env\.preview\.d1_databases\]\][\s\S]*?^binding\s*=\s*"([^"]+)"[\s\S]*?^database_name\s*=\s*"([^"]+)"[\s\S]*?^database_id\s*=\s*"([^"]+)"/m,
  )
  return {
    productionName: d1Match?.[2] ?? '',
    productionId: d1Match?.[3] ?? '',
    previewName: previewMatch?.[2] ?? '',
    previewId: previewMatch?.[3] ?? '',
  }
}

export function splitSqlStatements(sql) {
  const statements = []
  let buf = ''
  for (const line of sql.split('\n')) {
    buf += `${line}\n`
    if (line.trim().endsWith(';')) {
      const statement = buf.trim()
      if (statement) statements.push(statement)
      buf = ''
    }
  }
  const rest = buf.trim()
  if (rest) statements.push(rest)
  return statements
}

export function filterDumpStatements(statements, maxBytes = DEFAULT_MAX_STATEMENT_BYTES) {
  const kept = []
  let skippedMenu = 0
  for (const statement of statements) {
    if (statement.length <= maxBytes) {
      kept.push(statement)
      continue
    }
    if (SKIPPABLE_OVERSIZED.test(statement)) {
      skippedMenu += 1
      process.stderr.write(
        `Skipping ${statement.length}-byte senate vote-menu cache row (D1 SQLITE_TOOBIG).\n`,
      )
      continue
    }
    const preview = statement.replace(/\s+/g, ' ').slice(0, 90)
    throw new Error(`Refusing oversized SQL (${statement.length} bytes): ${preview}`)
  }
  return { statements: kept, skippedMenu }
}

export function chunkStatements(
  statements,
  maxStatements = DEFAULT_CHUNK_STATEMENTS,
  maxBytes = DEFAULT_CHUNK_BYTES,
) {
  const chunks = []
  let current = []
  let bytes = 0
  for (const statement of statements) {
    const size = statement.length + 1
    if (current.length > 0 && (current.length >= maxStatements || bytes + size > maxBytes)) {
      chunks.push(current)
      current = []
      bytes = 0
    }
    current.push(statement)
    bytes += size
  }
  if (current.length) chunks.push(current)
  return chunks
}

export function dumpTableInsertCount(statements, table) {
  const needle = `INSERT INTO "${table}"`
  return statements.filter((statement) => statement.startsWith(needle)).length
}

export function dumpVotesLatest(statements) {
  let latest = ''
  for (const statement of statements) {
    if (!statement.startsWith('INSERT INTO "votes"')) continue
    for (const match of statement.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)) {
      if (match[1] > latest) latest = match[1]
    }
  }
  return latest
}

export function dumpStats(statements) {
  return {
    votes: dumpTableInsertCount(statements, 'votes'),
    latest: dumpVotesLatest(statements),
    memberVotes: dumpTableInsertCount(statements, 'member_votes'),
  }
}

export function dropUserTablesSql(tableNames) {
  const lines = ['PRAGMA foreign_keys=OFF;']
  for (const name of tableNames) {
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`refusing to drop unexpected table name: ${name}`)
    }
    if (name.startsWith('_cf') || name.startsWith('sqlite_')) continue
    lines.push(`DROP TABLE IF EXISTS "${name}";`)
  }
  lines.push('PRAGMA foreign_keys=ON;')
  return `${lines.join('\n')}\n`
}

function wranglerEntry() {
  const local = path.join(workerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  if (!existsSync(local)) {
    throw new Error('wrangler not found — run npm --prefix workers/senate_data_worker ci')
  }
  return local
}

export function isRetryableD1Error(detail) {
  return /D1_RESET_DO|D1 reset before execute completed|exceeded its CPU|isolate exceeded|timed out|overloaded/i.test(
    detail,
  )
}

function wrangler(args, { json = false } = {}) {
  const result = spawnSync(process.execPath, [wranglerEntry(), ...args], {
    cwd: workerDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    const err = new Error(`wrangler exited ${result.status ?? result.signal ?? 'unknown'}`)
    err.stderr = result.stderr
    err.stdout = result.stdout
    throw err
  }
  return json ? result.stdout : ''
}

function executePreview({ file, command, json = false }) {
  const args = [
    'd1',
    'execute',
    PREVIEW_D1_NAME,
    '--remote',
    '--env',
    'preview',
    '--yes',
  ]
  if (file) args.push('--file', file)
  if (command) args.push('--command', command)
  if (json) args.push('--json')
  return wrangler(args, { json })
}

function d1Rows(raw) {
  const data = JSON.parse(raw)
  return Array.isArray(data) ? data[0].results : data.results
}

function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000)
}

function executeChunkWithRetry(file, attempt, total) {
  process.stderr.write(`  chunk ${attempt}/${total} (${path.basename(file)})\n`)
  for (let tryNum = 1; tryNum <= DEFAULT_RETRIES; tryNum += 1) {
    try {
      executePreview({ file })
      return
    } catch (err) {
      const detail = `${err.stderr ?? ''}\n${err.stdout ?? ''}\n${err.message}`
      if (!isRetryableD1Error(detail) || tryNum === DEFAULT_RETRIES) throw err
      process.stderr.write(`  retry ${tryNum}/${DEFAULT_RETRIES} after ${tryNum}s\n`)
      sleep(tryNum)
    }
  }
}

function importStatements(statements, { skippedMenu = 0 } = {}) {
  const chunks = chunkStatements(statements)
  const dir = mkdtempSync(path.join(tmpdir(), 'd1-import-chunks-'))
  process.stderr.write(
    `Importing ${statements.length} statements in ${chunks.length} chunks into ${PREVIEW_D1_NAME}` +
      (skippedMenu ? ` (skipped ${skippedMenu} senate vote-menu cache row)` : '') +
      '\n',
  )
  try {
    chunks.forEach((chunk, index) => {
      const file = path.join(dir, `chunk-${String(index + 1).padStart(4, '0')}.sql`)
      writeFileSync(file, `${chunk.join('\n')}\n`)
      executeChunkWithRetry(file, index + 1, chunks.length)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function planSync(toml = readFileSync(workerTomlPath, 'utf8')) {
  const cfg = parseWorkerD1Config(toml)
  if (cfg.productionName !== PRODUCTION_D1_NAME) {
    throw new Error(`production database_name is '${cfg.productionName}', expected '${PRODUCTION_D1_NAME}'`)
  }
  if (cfg.previewName !== PREVIEW_D1_NAME) {
    throw new Error(`preview database_name is '${cfg.previewName}', expected '${PREVIEW_D1_NAME}'`)
  }
  if (!cfg.productionId || !cfg.previewId) {
    throw new Error(`could not read D1 ids from ${workerTomlPath}`)
  }
  if (cfg.productionId === cfg.previewId) {
    throw new Error('production and preview D1 ids must differ')
  }
  return cfg
}

function wipePreview() {
  const tables = d1Rows(
    executePreview({
      command: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
      json: true,
    }),
  ).map((row) => row.name)
  const dropSql = dropUserTablesSql(tables)
  if (!dropSql.includes('DROP TABLE IF EXISTS')) return
  const dropFile = path.join(tmpdir(), `congress-tracker-preview-drop-${process.pid}.sql`)
  writeFileSync(dropFile, dropSql)
  try {
    executePreview({ file: dropFile })
  } finally {
    unlinkSync(dropFile)
  }
}

function previewStats() {
  const row = d1Rows(
    executePreview({
      command:
        'SELECT (SELECT COUNT(*) FROM votes) AS votes, (SELECT MAX(vote_date) FROM votes) AS latest, (SELECT COUNT(*) FROM member_votes) AS member_votes;',
      json: true,
    }),
  )[0]
  if (!row) throw new Error('preview stats query returned no rows')
  return {
    votes: Number(row.votes),
    latest: String(row.latest ?? ''),
    memberVotes: Number(row.member_votes),
  }
}

export function runSync({
  dryRun = process.env.SYNC_PREVIEW_DB_DRY_RUN === '1',
  dumpPath = process.env.SYNC_PREVIEW_DB_DUMP || '',
} = {}) {
  const cfg = planSync()
  process.stdout.write(`sync-preview-db: clone production D1 → preview D1\n`)
  process.stdout.write(`  source (export only): ${PRODUCTION_D1_NAME} (${cfg.productionId})\n`)
  process.stdout.write(`  dest   (write only):  ${PREVIEW_D1_NAME} (${cfg.previewId})\n`)
  process.stdout.write(`  production is never executed against for writes\n`)
  process.stdout.write(
    `  remote export makes production D1 briefly unavailable; reuse SYNC_PREVIEW_DB_DUMP to skip it\n`,
  )
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: would export ${PRODUCTION_D1_NAME} --remote, DROP user tables on ${PREVIEW_D1_NAME} (keeping _cf_KV / sqlite_*), import in chunks with --env preview, then verify votes + member_votes counts.\n`,
    )
    return cfg
  }
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required')
  }

  const resolvedDump = dumpPath || path.join(tmpdir(), 'congress-tracker-preview-clone.sql')
  let ownedDump = !dumpPath
  if (!dumpPath) {
    process.stderr.write(
      `Exporting production D1 (read-only). Live production queries may stall until this finishes.\n`,
    )
    wrangler(['d1', 'export', PRODUCTION_D1_NAME, '--remote', '--output', resolvedDump])
  } else {
    process.stderr.write(`Reusing dump ${resolvedDump} (skipping production export).\n`)
  }
  if (!existsSync(resolvedDump) || readFileSync(resolvedDump, 'utf8').length === 0) {
    throw new Error('production export was empty')
  }

  try {
    const { statements, skippedMenu } = filterDumpStatements(
      splitSqlStatements(readFileSync(resolvedDump, 'utf8')),
    )
    const dump = dumpStats(statements)
    if (dump.votes < 1 || !dump.latest) {
      throw new Error('production export is missing votes rows')
    }
    process.stderr.write(
      `  dump votes=${dump.votes} latest=${dump.latest} member_votes=${dump.memberVotes}\n`,
    )

    process.stderr.write(
      `Dropping preview user tables, then importing. A failed import leaves preview empty until this command is retried (SYNC_PREVIEW_DB_DUMP=${resolvedDump} skips a new production export).\n`,
    )
    wipePreview()
    importStatements(statements, { skippedMenu })
    const preview = previewStats()
    if (
      preview.votes !== dump.votes ||
      preview.latest !== dump.latest ||
      preview.memberVotes !== dump.memberVotes
    ) {
      throw new Error(
        `preview votes=${preview.votes} latest=${preview.latest} member_votes=${preview.memberVotes} does not match dump votes=${dump.votes} latest=${dump.latest} member_votes=${dump.memberVotes}`,
      )
    }
    process.stdout.write(
      `Preview D1 now matches the dump (${preview.votes} votes, latest ${preview.latest}, ${preview.memberVotes} member_votes).\n`,
    )
    process.stdout.write(
      `Existing preview URLs share this database; wait ~60s for feed Cache-Control to expire.\n`,
    )
    if (ownedDump && existsSync(resolvedDump)) unlinkSync(resolvedDump)
  } catch (err) {
    process.stderr.write(
      `Clone failed. Preview D1 may be empty. Retry without re-exporting production:\n  SYNC_PREVIEW_DB_DUMP=${resolvedDump} npm run sync:preview-db\n`,
    )
    throw err
  }
  return cfg
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runSync()
  } catch (err) {
    process.stderr.write(`${err.message || err}\n`)
    process.exit(err.message?.includes('CLOUDFLARE_') ? 2 : 1)
  }
}
