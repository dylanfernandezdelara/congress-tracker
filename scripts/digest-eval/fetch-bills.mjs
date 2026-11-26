#!/usr/bin/env node
/**
 * Digest eval, step 1: build each bill's summary input with the worker's own prepareBill
 * (workers/senate_data_worker/src/digest/prepare.ts), so the evals test exactly what production sends: the same
 * text version, CRS summary, committees, and status and floor votes read from the bill's Congress.gov actions.
 *
 * Env: CONGRESS_API_KEY (defaults to workers/senate_data_worker/.dev.vars). Writes artifacts/digest-eval/bills/<id>.json.
 * Usage: node scripts/digest-eval/fetch-bills.mjs [id ...]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const outDir = join(root, 'artifacts', 'digest-eval', 'bills')
mkdirSync(outDir, { recursive: true })

function devVar(name) {
  if (process.env[name]) return process.env[name]
  const vars = readFileSync(join(root, 'workers/senate_data_worker/.dev.vars'), 'utf8')
  return vars.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim()
}
const KEY = devVar('CONGRESS_API_KEY')
const workerDir = join(root, 'workers/senate_data_worker')

/** Bundle the worker's prepare.ts once (Node cannot import the worker's extensionless TypeScript directly). */
async function loadPrepare() {
  const out = join(root, 'artifacts', 'digest-eval', '.prepare.mjs')
  execFileSync(join(workerDir, 'node_modules/.bin/esbuild'), [
    join(workerDir, 'src/digest/prepare.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error',
  ])
  return import(pathToFileURL(out).href)
}

/** One bill's production summary input, in the eval's bill-file shape. */
async function fetchBill(prepareBill, id) {
  const [, congress, type, number] = /^(\d+)-([a-z]+)-(\d+)$/.exec(id)
  const ref = { congress: Number(congress), type: type.toUpperCase(), number: Number(number) }
  const prepared = await prepareBill({ CONGRESS_API_KEY: KEY }, ref)
  const { input, bundle } = prepared
  const sponsor = bundle.sponsors.find((s) => s.isPrimary) ?? bundle.sponsors[0] ?? null
  return {
    id,
    congress: ref.congress,
    type: ref.type,
    number: ref.number,
    title: input.title,
    sponsor: sponsor ? { name: sponsor.fullName ?? input.sponsorName, party: sponsor.party ?? null, state: sponsor.state ?? null } : null,
    introducedDate: bundle.introducedDate,
    status: input.status,
    votes: input.votes,
    policyArea: input.policyArea,
    committees: input.committees,
    crs: input.crs,
    textVersion: input.textVersion,
    // A split bill's whole text is kept for the checks; the prompt reads it part by part.
    text: input.text ?? (prepared.parts.length ? prepared.parts.map((p) => p.text).join('\n\n') : null),
    tokens: prepared.totalTokens,
    parts: prepared.parts,
    basis: prepared.basis,
    fingerprint: prepared.fingerprint,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lists = JSON.parse(readFileSync(join(here, 'bills.json'), 'utf8'))
  const { prepareBill } = await loadPrepare()
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : [...lists.practice, ...lists.test].map((b) => b.id)
  for (const id of ids) {
    const file = join(outDir, `${id}.json`)
    if (existsSync(file) && !process.env.REFETCH) {
      console.log(`cached ${id}`)
      continue
    }
    try {
      const data = await fetchBill(prepareBill, id)
      writeFileSync(file, JSON.stringify(data, null, 2))
      console.log(`${id.padEnd(14)} ${data.status.stage.padEnd(15)} text ${String(data.tokens).padStart(7)} tok  parts ${data.parts.length}  crs ${data.crs ? 'yes' : 'no'}`)
    } catch (err) {
      console.log(`${id} FAILED ${err.message}`)
    }
  }
}
