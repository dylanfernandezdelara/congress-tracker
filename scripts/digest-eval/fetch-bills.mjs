#!/usr/bin/env node
/**
 * Digest eval, step 1: fetch everything a summary could be written from, for each bill in bills.json.
 * Congress.gov: metadata (title, sponsor, status, committees, policy area), the newest CRS summary, and the
 * newest published text (Formatted XML → plain text with section markers). Long bills are split along their
 * own structure (divisions, else titles, oversized parts again by subtitle) for the per-part pass.
 *
 * Env: CONGRESS_API_KEY (defaults to workers/senate_data_worker/.dev.vars). Writes artifacts/digest-eval/bills/<id>.json.
 * Usage: node scripts/digest-eval/fetch-bills.mjs [id ...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const UA = { 'User-Agent': 'Mozilla/5.0 (trackcongress digest eval)' }

/** Bills longer than this (≈ tokens) are summarized per part, then combined. */
export const SINGLE_PASS_MAX_TOKENS = 30_000
const PART_MAX_TOKENS = 45_000
export const approxTokens = (text) => Math.ceil(text.length / 4)

async function api(path) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://api.congress.gov/v3/${path}${sep}format=json&api_key=${KEY}`, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : (ENTITIES[e.toLowerCase()] ?? whole),
  )
}

/** Bill XML → readable text that keeps section numbers ("SEC. 2. HEADER") on their own lines. */
export function xmlToText(xml) {
  return decode(
    xml
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<preamble\b[^>]*>/g, '\n\nPREAMBLE\n')
      .replace(/<\/preamble>/g, '\n\nEND OF PREAMBLE\n\n')
      .replace(/<(quote|term)\b[^>]*>/g, '“')
      .replace(/<\/(quote|term)>/g, '”')
      .replace(/<section\b[^>]*>\s*<enum>([^<]*)<\/enum>\s*<header>([\s\S]*?)<\/header>/g, '\n\nSEC. $1 $2\n')
      .replace(/<(subtitle|title|division|part|chapter)\b[^>]*>\s*<enum>([^<]*)<\/enum>\s*<header>([\s\S]*?)<\/header>/g, (_m, tag, e, h) => `\n\n${tag.toUpperCase()} ${e} — ${h}\n`)
      .replace(/<\/?(subsection|paragraph|subparagraph|clause|quoted-block|p|text|whereas)\b[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const htmlToText = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Top-level elements of `tag` inside `body`, with their XML, tracking nesting depth. */
function topLevel(body, tag) {
  const out = []
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
  let depth = 0
  let start = -1
  for (const m of body.matchAll(re)) {
    if (m[1] !== '/') {
      if (depth === 0) start = m.index
      depth += 1
    } else if (depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) out.push({ start, end: m.index + m[0].length })
    }
  }
  return out
}

function heading(xml) {
  const m = /^<[^>]+>\s*<enum>([^<]*)<\/enum>\s*<header>([\s\S]*?)<\/header>/.exec(xml)
  return m ? { enum: decode(m[1]).trim(), header: decode(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() } : null
}

/** Split a long bill along its own structure; any leftover sections before the first part become "General". */
export function splitParts(bodyXml) {
  for (const tag of ['division', 'title']) {
    const spans = topLevel(bodyXml, tag)
    if (spans.length < 2) continue
    const parts = []
    const lead = xmlToText(bodyXml.slice(0, spans[0].start))
    if (lead.length > 200) parts.push({ label: 'General provisions', text: lead })
    for (const span of spans) {
      const xml = bodyXml.slice(span.start, span.end)
      const h = heading(xml)
      const label = h ? `${tag[0].toUpperCase()}${tag.slice(1)} ${h.enum} — ${h.header}` : tag
      const text = xmlToText(xml)
      if (approxTokens(text) > PART_MAX_TOKENS) {
        const subs = topLevel(xml.slice(1), 'subtitle').map((s) => ({ start: s.start + 1, end: s.end + 1 }))
        if (subs.length >= 2) {
          for (const sub of subs) {
            const subXml = xml.slice(sub.start, sub.end)
            const sh = heading(subXml)
            parts.push({ label: `${label} / Subtitle ${sh?.enum ?? ''} — ${sh?.header ?? ''}`, text: xmlToText(subXml) })
          }
          continue
        }
      }
      parts.push({ label, text })
    }
    return parts.map((p) => ({ ...p, tokens: approxTokens(p.text) }))
  }
  return []
}

/**
 * Where the bill stands. The latest action alone misleads (a House-passed bill's latest action is often the
 * Senate referral), so passage is read from the text versions each chamber publishes.
 */
function statusOf(bill, versionTypes) {
  if (bill.laws?.length) return { stage: 'law', label: `Became law (${bill.laws[0].type} ${bill.laws[0].number})` }
  const action = bill.latestAction?.text ?? ''
  if (/vetoed/i.test(action)) return { stage: 'vetoed', label: 'Vetoed' }
  const has = (re) => versionTypes.some((t) => re.test(t))
  if (has(/^Enrolled/)) return { stage: 'passed_both', label: 'Passed both chambers' }
  const origin = bill.originChamber === 'Senate' ? 'Senate' : 'House'
  const other = origin === 'House' ? 'Senate' : 'House'
  if (has(new RegExp(`Engrossed in ${origin}|(Referred|Received|Placed on Calendar) in ${other}`)))
    return { stage: 'passed_chamber', label: `Passed the ${origin}` }
  if (/agreed to|passed/i.test(action)) return { stage: 'passed_chamber', label: action }
  return { stage: 'introduced', label: 'Introduced' }
}

async function fetchBill(id) {
  const [, congress, type, number] = /^(\d+)-([a-z]+)-(\d+)$/.exec(id)
  const base = `bill/${congress}/${type}/${number}`
  const { bill } = await api(base)
  const [summaries, texts, committees] = await Promise.all([
    api(`${base}/summaries`).catch(() => ({ summaries: [] })),
    api(`${base}/text`).catch(() => ({ textVersions: [] })),
    api(`${base}/committees`).catch(() => ({ committees: [] })),
  ])
  const crs = [...(summaries.summaries ?? [])].sort((a, b) => (a.updateDate < b.updateDate ? 1 : -1))[0]
  const version = (texts.textVersions ?? []).find((v) => v.type !== 'Public Law' && v.formats?.some((f) => f.type === 'Formatted XML'))
  let text = null
  let parts = []
  if (version) {
    const url = version.formats.find((f) => f.type === 'Formatted XML').url
    const xml = await (await fetch(url, { headers: UA })).text()
    const bodyStart = xml.search(/<(preamble|legis-body|resolution-body)\b/) // a preamble before the body is kept
    const bodyXml = bodyStart >= 0 ? xml.slice(bodyStart) : xml
    text = xmlToText(bodyXml)
    if (approxTokens(text) > SINGLE_PASS_MAX_TOKENS) parts = splitParts(bodyXml)
  }
  const sponsor = bill.sponsors?.[0]
  return {
    id,
    congress: Number(congress),
    type: type.toUpperCase(),
    number: Number(number),
    title: bill.title,
    sponsor: sponsor ? { name: sponsor.fullName, party: sponsor.party, state: sponsor.state } : null,
    introducedDate: bill.introducedDate,
    status: statusOf(bill, (texts.textVersions ?? []).map((v) => v.type ?? '')),
    latestAction: bill.latestAction ?? null,
    policyArea: bill.policyArea?.name ?? null,
    committees: (committees.committees ?? []).map((c) => c.name),
    crs: crs ? { version: crs.actionDesc, date: crs.actionDate, text: htmlToText(crs.text) } : null,
    textVersion: version ? { type: version.type, date: version.date } : null,
    text,
    tokens: text ? approxTokens(text) : 0,
    parts,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lists = JSON.parse(readFileSync(join(here, 'bills.json'), 'utf8'))
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : [...lists.practice, ...lists.test].map((b) => b.id)
  for (const id of ids) {
    const file = join(outDir, `${id}.json`)
    if (existsSync(file) && !process.env.REFETCH) {
      console.log(`cached ${id}`)
      continue
    }
    try {
      const data = await fetchBill(id)
      writeFileSync(file, JSON.stringify(data, null, 2))
      console.log(`${id.padEnd(14)} ${data.status.stage.padEnd(15)} text ${String(data.tokens).padStart(7)} tok  parts ${data.parts.length}  crs ${data.crs ? 'yes' : 'no'}`)
    } catch (err) {
      console.log(`${id} FAILED ${err.message}`)
    }
  }
}
