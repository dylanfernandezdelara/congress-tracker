/**
 * Free regression check: the worker's pre-store checks over saved eval outputs. A summary the reviewer picked must
 * never be blocked, so any blocking flag on a picked output fails the run (exit 1). No model calls.
 *
 *   node scripts/digest-eval/regress.mjs [round=round2]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSummary } from './checks.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const art = join(root, 'artifacts/digest-eval')
const round = process.argv[2] ?? 'round2'
// Round 1 wrote candidates straight under out/; later rounds have their own folder.
const outDir = existsSync(join(art, 'out', round)) ? join(art, 'out', round) : join(art, 'out')
const picksFile = join(art, `${round}-picks.json`)
const picks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, 'utf8')) : {}
/** Picked candidates per bill, however the picks file spells them. */
const picked = (id) => [picks[id]?.best ?? picks[id]?.pick ?? picks[id]].flat().filter((p) => typeof p === 'string')

let failures = 0
const rows = []
for (const candidate of readdirSync(outDir).filter((d) => !/^round/.test(d))) {
  for (const file of readdirSync(join(outDir, candidate))) {
    const out = JSON.parse(readFileSync(join(outDir, candidate, file), 'utf8'))
    if (!out.summary || !out.id) continue
    const bill = JSON.parse(readFileSync(join(art, 'bills', `${out.id}.json`), 'utf8'))
    const { blocking, flags } = checkSummary(out.summary, bill, { long: (bill.parts ?? []).length > 0 })
    const isPick = picked(out.id).includes(candidate)
    if (isPick && blocking.length) failures += 1
    rows.push({ bill: out.id, run: out.run, candidate, pick: isPick ? 'yes' : '', blocking: blocking.join('; '), warnings: flags.length - blocking.length })
  }
}
console.table(rows.filter((r) => r.blocking || r.pick))
const blocked = rows.filter((r) => r.blocking).length
console.log(`${rows.length} outputs, ${blocked} blocked, ${failures} picked outputs blocked`)
process.exit(failures ? 1 : 0)
