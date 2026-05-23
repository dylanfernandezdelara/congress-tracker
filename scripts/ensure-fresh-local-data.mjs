#!/usr/bin/env node
/**
 * After local workers are up: if activity/ledger data is missing or past DATA_FRESHNESS_MAX_HOURS,
 * trigger a full pipeline ingestion and wait until the API can serve a non-empty briefing feed.
 *
 * Env:
 *   API_URL / HARNESS_API_URL     — default http://127.0.0.1:8787
 *   PIPELINE_URL / HARNESS_PIPELINE_URL — default http://127.0.0.1:8788
 *   ENSURE_DATA_MAX_WAIT_MS       — max wait after ingest (default 420000)
 *   ENSURE_DATA_POLL_MS           — poll interval (default 2500)
 */

const API = (process.env.API_URL || process.env.HARNESS_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const PIPELINE = (process.env.PIPELINE_URL || process.env.HARNESS_PIPELINE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '')
const MAX_WAIT_MS = Math.max(60_000, Number(process.env.ENSURE_DATA_MAX_WAIT_MS || 420_000))
const POLL_MS = Math.max(500, Number(process.env.ENSURE_DATA_POLL_MS || 2500))

async function fetchJson(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json, text }
}

function needsIngest(health, ledger) {
  const healthOk = health.ok && health.json?.status === 'ok'
  const ledgerOk =
    ledger.ok &&
    Array.isArray(ledger.json?.entries) &&
    ledger.json.entries.length > 0

  if (!healthOk) {
    if (!health.ok) {
      console.log(
        `[ensure-data] /health/data returned HTTP ${health.status} — will run ingestion.`,
      )
    } else {
      console.log(
        `[ensure-data] Activity index is stale or missing (${health.json?.status ?? 'unknown'}) — will run ingestion.`,
      )
    }
    return true
  }
  if (!ledgerOk) {
    console.log('[ensure-data] Vote ledger missing or empty — will run ingestion.')
    return true
  }
  console.log(
    `[ensure-data] Data looks fresh (activity ${health.json?.generated_at ?? 'n/a'}, ${ledger.json.entries.length} ledger votes).`,
  )
  return false
}

async function waitForBriefing(start) {
  while (Date.now() - start < MAX_WAIT_MS) {
    const briefing = await fetchJson(`${API}/briefings/latest.json`)
    const n = briefing.json?.items?.length ?? 0
    if (briefing.ok && n > 0) {
      console.log(`[ensure-data] Briefing ready (${n} items on homepage feed).`)
      return true
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  console.warn(
    `[ensure-data] Timed out after ${MAX_WAIT_MS}ms waiting for /briefings/latest.json to return items.`,
  )
  console.warn('[ensure-data] You can run ./scripts/refresh-data.sh manually once workers are stable.')
  return false
}

async function main() {
  const health = await fetchJson(`${API}/health/data`)
  const ledger = await fetchJson(`${API}/votes/ledger.json`)

  if (!needsIngest(health, ledger)) {
    return
  }

  console.log('[ensure-data] Calling pipeline ingestion (GET /__pipeline/run/ingestion); this can take several minutes…')
  const ingest = await fetchJson(`${PIPELINE}/__pipeline/run/ingestion`)
  if (!ingest.ok) {
    console.error(
      `[ensure-data] Ingestion request failed: HTTP ${ingest.status} ${ingest.text?.slice(0, 200) ?? ''}`,
    )
    process.exitCode = 1
    return
  }
  console.log('[ensure-data] Ingestion HTTP completed; waiting for materialized briefing…')
  const ok = await waitForBriefing(Date.now())
  process.exitCode = ok ? 0 : 1
}

main().catch((err) => {
  console.error('[ensure-data]', err)
  process.exitCode = 1
})
