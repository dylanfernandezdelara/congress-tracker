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

/** Checks added with a prompt rule, and the prompt version that introduced the rule. */
const RULES_SINCE = [{ reason: 'headline mentions the vote', version: 'v3.2' }]
/** "v3" < "v3.2"; outputs without a version (round 1) count as oldest. */
function versionBefore(version, than) {
  const parts = (v) => String(v ?? 'v0').replace(/^v/, '').split('.').map(Number)
  const [a, b] = [parts(version), parts(than)]
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  }
  return false
}

let failures = 0
const rows = []
for (const candidate of readdirSync(outDir).filter((d) => !/^round/.test(d))) {
  for (const file of readdirSync(join(outDir, candidate))) {
    const out = JSON.parse(readFileSync(join(outDir, candidate, file), 'utf8'))
    if (!out.summary || !out.id) continue
    const bill = JSON.parse(readFileSync(join(art, 'bills', `${out.id}.json`), 'utf8'))
    const checked = checkSummary(out.summary, bill, { long: (bill.parts ?? []).length > 0 })
    // Rules that postdate an output are not held against it (picks from earlier rounds were made under older prompts).
    const since = RULES_SINCE.filter((r) => versionBefore(out.promptVersion, r.version)).map((r) => r.reason)
    const blocking = checked.blocking.filter((b) => !since.includes(b))
    const flags = checked.flags.filter((f) => !since.includes(f))
    const isPick = picked(out.id).includes(candidate)
    if (isPick && blocking.length) failures += 1
    rows.push({ bill: out.id, run: out.run, candidate, pick: isPick ? 'yes' : '', blocking: blocking.join('; '), warnings: flags.length - blocking.length })
  }
}
console.table(rows.filter((r) => r.blocking || r.pick))
const blocked = rows.filter((r) => r.blocking).length
console.log(`${rows.length} outputs, ${blocked} blocked, ${failures} picked outputs blocked`)
process.exit(failures ? 1 : 0)
