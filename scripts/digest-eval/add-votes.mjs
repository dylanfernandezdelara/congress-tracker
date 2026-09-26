#!/usr/bin/env node
/**
 * Digest eval: attach each bill's recorded floor votes (production D1, read-only) to its fetched JSON, so the
 * summary can never contradict what happened on the floor (e.g. a vote that failed short of two-thirds).
 * Usage: node scripts/digest-eval/add-votes.mjs [id ...]   (needs wrangler logged in to the production account)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const billsDir = join(root, 'artifacts', 'digest-eval', 'bills')

const ids = process.argv.slice(2)
for (const id of ids) {
  const [, congress, type, number] = /^(\d+)-([a-z]+)-(\d+)$/.exec(id)
  const sql = `SELECT chamber, vote_date, question, result, yeas, nays FROM votes WHERE congress=${Number(congress)} AND bill_type='${type.toUpperCase()}' AND bill_number=${Number(number)} ORDER BY vote_date`
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const votes = JSON.parse(out)[0].results
  const file = join(billsDir, `${id}.json`)
  const bill = JSON.parse(readFileSync(file, 'utf8'))
  bill.votes = votes
  writeFileSync(file, JSON.stringify(bill, null, 2))
  console.log(`${id}: ${votes.length} vote(s)`)
}
