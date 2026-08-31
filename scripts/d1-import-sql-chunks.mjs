#!/usr/bin/env node
/**
 * Import a SQL dump into a D1 database in small chunks.
 * Full-file wrangler imports of ~40k statements hit D1_RESET_DO.
 *
 * Refuses production `congress-tracker`. Preview is the intended dest.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRODUCTION_D1_NAME = 'congress-tracker'
export const PREVIEW_D1_NAME = 'congress-tracker-preview'
export const DEFAULT_CHUNK_STATEMENTS = 250
export const DEFAULT_CHUNK_BYTES = 90_000
export const DEFAULT_RETRIES = 8
export const DEFAULT_MAX_STATEMENT_BYTES = 100_000

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

export function dropOversizedStatements(statements, maxBytes = DEFAULT_MAX_STATEMENT_BYTES) {
  const kept = []
  for (const statement of statements) {
    if (statement.length > maxBytes) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 90)
      process.stderr.write(
        `Skipping ${statement.length}-byte statement (over ${maxBytes}): ${preview}\n`,
      )
      continue
    }
    kept.push(statement)
  }
  return kept
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
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= maxStatements || bytes + size > maxBytes)
    if (wouldOverflow) {
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

function wranglerEntry(workerDir) {
  const local = path.join(workerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  if (!existsSync(local)) {
    throw new Error(
      'wrangler not found — run npm --prefix workers/senate_data_worker ci',
    )
  }
  return local
}

function sleep(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  execFileSync('sleep', [String(seconds)])
}

function executeChunk({ wrangler, workerDir, database, envName, file, attempt, total }) {
  const args = [
    'd1',
    'execute',
    database,
    '--remote',
    '--yes',
    '--file',
    file,
  ]
  if (envName) args.splice(5, 0, '--env', envName)
  process.stderr.write(`  chunk ${attempt}/${total} (${path.basename(file)})\n`)
  execFileSync(process.execPath, [wrangler, ...args], {
    cwd: workerDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function executeChunkWithRetry(opts) {
  let lastError
  for (let tryNum = 1; tryNum <= opts.retries; tryNum += 1) {
    try {
      executeChunk(opts)
      return
    } catch (err) {
      lastError = err
      const detail = `${err.stderr?.toString() ?? ''}\n${err.stdout?.toString() ?? ''}\n${err.message}`
      const retryable = /D1_RESET_DO|exceeded its CPU|isolate exceeded|timed out|overloaded/i.test(
        detail,
      )
      if (!retryable || tryNum === opts.retries) throw err
      const waitMs = 2000 * tryNum
      process.stderr.write(`  retry ${tryNum}/${opts.retries} after ${waitMs}ms (${detail.trim().slice(0, 180)})\n`)
      sleep(waitMs)
    }
  }
  throw lastError
}

export function parseArgs(argv) {
  const out = {
    file: '',
    database: '',
    env: '',
    chunkStatements: DEFAULT_CHUNK_STATEMENTS,
    chunkBytes: DEFAULT_CHUNK_BYTES,
    retries: DEFAULT_RETRIES,
    startChunk: 1,
    maxStatementBytes: DEFAULT_MAX_STATEMENT_BYTES,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--file') {
      out.file = next
      i += 1
    } else if (arg === '--database') {
      out.database = next
      i += 1
    } else if (arg === '--env') {
      out.env = next
      i += 1
    } else if (arg === '--chunk-statements') {
      out.chunkStatements = Number(next)
      i += 1
    } else if (arg === '--chunk-bytes') {
      out.chunkBytes = Number(next)
      i += 1
    } else if (arg === '--retries') {
      out.retries = Number(next)
      i += 1
    } else if (arg === '--start-chunk') {
      out.startChunk = Number(next)
      i += 1
    } else if (arg === '--max-statement-bytes') {
      out.maxStatementBytes = Number(next)
      i += 1
    }
  }
  return out
}

function runImport(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (!args.file || !args.database) {
    throw new Error('Usage: d1-import-sql-chunks.mjs --file dump.sql --database congress-tracker-preview --env preview')
  }
  if (args.database === PRODUCTION_D1_NAME) {
    throw new Error(`Refusing to import into production D1 '${PRODUCTION_D1_NAME}'`)
  }
  if (args.database !== PREVIEW_D1_NAME) {
    throw new Error(`Refusing dest '${args.database}'; expected '${PREVIEW_D1_NAME}'`)
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const workerDir = path.join(repoRoot, 'workers', 'senate_data_worker')
  const wrangler = wranglerEntry(workerDir)
  const sql = readFileSync(args.file, 'utf8')
  const allStatements = splitSqlStatements(sql)
  const start = Number.isFinite(args.startChunk) && args.startChunk > 1 ? args.startChunk : 1
  const originalChunks = chunkStatements(
    allStatements,
    args.chunkStatements,
    args.chunkBytes,
  )
  const chunks =
    start === 1
      ? chunkStatements(
          dropOversizedStatements(allStatements, args.maxStatementBytes),
          args.chunkStatements,
          args.chunkBytes,
        )
      : originalChunks
          .slice(start - 1)
          .map((chunk) => dropOversizedStatements(chunk, args.maxStatementBytes))
          .filter((chunk) => chunk.length > 0)
  const dir = mkdtempSync(path.join(tmpdir(), 'd1-import-chunks-'))
  process.stderr.write(
    `Importing ${chunks.reduce((n, c) => n + c.length, 0)} statements in ${chunks.length} chunks into ${args.database}` +
      (start > 1 ? ` (resuming at original chunk ${start}/${originalChunks.length})` : '') +
      '\n',
  )
  try {
    chunks.forEach((chunk, index) => {
      const file = path.join(dir, `chunk-${String(index + 1).padStart(4, '0')}.sql`)
      writeFileSync(file, `${chunk.join('\n')}\n`)
      executeChunkWithRetry({
        wrangler,
        workerDir,
        database: args.database,
        envName: args.env,
        file,
        attempt: index + 1,
        total: chunks.length,
        retries: args.retries,
      })
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runImport()
  } catch (err) {
    process.stderr.write(`${err.message || err}\n`)
    if (err.stderr) process.stderr.write(err.stderr.toString())
    process.exit(1)
  }
}
