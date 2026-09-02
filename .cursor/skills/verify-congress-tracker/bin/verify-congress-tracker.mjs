#!/usr/bin/env node
/**
 * Launch, doctor, drive, and clean up a local Congress Tracker instance.
 * Evidence lives under artifacts/verify/<feature>/ and is never deleted by cleanup.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(here, '../../../..')
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'artifacts', 'verify')
const RUN_DIR = path.join(EVIDENCE_ROOT, '.run')
const STATE_PATH = path.join(RUN_DIR, 'state.json')
const WEB_URL = 'http://127.0.0.1:5173'
const WORKER_URL = 'http://127.0.0.1:8787'
const WEB_PORT = 5173
const WORKER_PORT = 8787
const CDP_PORT = 9223
const VIEWPORT = { width: 1280, height: 800 }
const ENERGY_HEADLINE =
  'House passes a broad energy permitting and production package (local sample)'
const LANDS_HEADLINE =
  'Senate passes a public lands conservation and access bill (local sample)'
const OVERSIGHT_HEADLINE =
  'House passes a federal spending oversight bill (local sample)'
const REQUIRED_HEADLINES = [ENERGY_HEADLINE, LANDS_HEADLINE, OVERSIGHT_HEADLINE]
const API_PATH_PATTERN =
  /^\/(?:(?:feed|stats)(?:\/[^?]*)?|health|debug\/[^?]+\.json)(?:\?|$)/

function fail(message, code = 1) {
  console.error(`verify-congress-tracker: ${message}`)
  process.exit(code)
}

function usage() {
  console.error(`Usage:
  verify-congress-tracker launch
  verify-congress-tracker doctor
  verify-congress-tracker cleanup
  verify-congress-tracker api GET <path>
  verify-congress-tracker browser start
  verify-congress-tracker browser goto [--path /] [--url <url>]
  verify-congress-tracker browser click (--role <role> --name <name> | --selector <sel>) [--exact] [--nth N]
  verify-congress-tracker browser fill (--role <role> --name <name> | --selector <sel>) --value <value> [--exact]
  verify-congress-tracker browser select --name <label> --value <value>
  verify-congress-tracker browser press --key <key>
  verify-congress-tracker browser wait (--role <role> --name <name> | --selector <sel>) [--exact] [--nth N] [--timeout-ms 15000]
  verify-congress-tracker browser snapshot --aria --path <file-under-artifacts/verify>
  verify-congress-tracker browser screenshot --path <file-under-artifacts/verify> [--full-page]

  api GET is read-only and limited to /feed, /stats, /health, and /debug/*.json.
  --name /regex/ is a JavaScript regex. Snapshot always writes an ARIA snapshot (--aria is required).
`)
  process.exit(2)
}

function parseArgs(argv) {
  const flags = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--exact' || token === '--full-page' || token === '--aria') {
      flags[token.slice(2)] = true
      continue
    }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) fail(`missing value for --${key}`)
      flags[key] = value
      i += 1
      continue
    }
    flags._.push(token)
  }
  return flags
}

function parseName(raw) {
  if (raw === undefined) return undefined
  const match = raw.match(/^\/(.+)\/([a-z]*)$/s)
  if (match) return new RegExp(match[1], match[2])
  return raw
}

function isAllowedApiPath(apiPath) {
  if (typeof apiPath !== 'string' || apiPath.includes('..')) return false
  return API_PATH_PATTERN.test(apiPath)
}

function isAppUrl(raw) {
  try {
    return new URL(raw).origin === WEB_URL
  } catch {
    return false
  }
}

function resolveEvidencePath(raw) {
  if (!raw) throw new Error('path is required')
  const reject = () => {
    throw new Error(`evidence path must stay under artifacts/verify: ${raw}`)
  }
  if (path.isAbsolute(raw)) reject()
  const trimmed = raw.replace(/^\.\//, '')
  const relative = trimmed.startsWith('artifacts/verify/')
    ? trimmed.slice('artifacts/verify/'.length)
    : trimmed
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) reject()
  const resolved = path.resolve(EVIDENCE_ROOT, relative)
  const root = EVIDENCE_ROOT.endsWith(path.sep) ? EVIDENCE_ROOT : `${EVIDENCE_ROOT}${path.sep}`
  if (resolved !== EVIDENCE_ROOT && !resolved.startsWith(root)) reject()
  return resolved
}

function sampleHeadlines(items) {
  return (items || [])
    .map((item) => item?.digest?.headline || item?.bill?.title || '')
    .filter((text) => text.includes('(local sample)'))
}

function seedFeedProblems(items) {
  const errors = []
  const warnings = []
  if (!Array.isArray(items) || items.length === 0) {
    return { errors: ['feed has no items'], warnings }
  }
  const samples = sampleHeadlines(items)
  if (samples.length !== items.length) {
    warnings.push(
      `feed is mixed: ${items.length} items, ${samples.length} local-sample. Seed upserts samples but does not delete live votes; wipe workers/senate_data_worker/.wrangler/state if exclusivity proofs fail.`,
    )
  }
  for (const headline of REQUIRED_HEADLINES) {
    if (!samples.includes(headline)) {
      errors.push(`missing required sample headline: ${headline}`)
    }
  }
  return { errors, warnings }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) return null
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeState(state) {
  ensureDir(RUN_DIR)
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`)
}

function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function listenersOnPort(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) return []
  return [...new Set(result.stdout.trim().split(/\n/).filter(Boolean).map(Number))]
}

function portFree(port) {
  return listenersOnPort(port).length === 0
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) {
          reject(new Error(`timed out waiting for 127.0.0.1:${port}`))
          return
        }
        setTimeout(tryOnce, 250)
      })
    }
    tryOnce()
  })
}

async function fetchJson(url) {
  const response = await fetch(url)
  const text = await response.text()
  let body = text
  try {
    body = JSON.parse(text)
  } catch {
    // keep text
  }
  return { ok: response.ok, status: response.status, body }
}

function spawnLogged(command, args, logPath) {
  ensureDir(path.dirname(logPath))
  const logFd = fs.openSync(logPath, 'a')
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, FORCE_COLOR: '0', CI: process.env.CI || '1' },
  })
  child.unref()
  fs.closeSync(logFd)
  return child.pid
}

function killPid(pid, signal = 'SIGTERM') {
  if (!pidAlive(pid)) return
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}

function anyRecordedPidAlive(state) {
  return (
    pidAlive(state?.pids?.worker) || pidAlive(state?.pids?.web) || pidAlive(state?.pids?.browser)
  )
}

function sleepMs(ms) {
  spawnSync('sleep', [String(ms / 1000)])
}

function requireOwnState() {
  const state = readState()
  if (!state) {
    fail(
      `no verification instance is recorded at ${STATE_PATH}. Run launch first. Do not drive a shared or pre-existing server.`,
    )
  }
  return state
}

function instanceOwnershipProblems(state) {
  const problems = []
  if (!pidAlive(state.pids?.worker)) problems.push(`worker pid ${state.pids?.worker} is not running`)
  if (!pidAlive(state.pids?.web)) problems.push(`web pid ${state.pids?.web} is not running`)
  if (!state.seeded) problems.push('launch did not record a successful seed')
  if (listenersOnPort(WEB_PORT).length === 0) problems.push(`nothing listening on ${WEB_PORT}`)
  if (listenersOnPort(WORKER_PORT).length === 0) problems.push(`nothing listening on ${WORKER_PORT}`)
  return problems
}

function requireOwnInstance() {
  const state = requireOwnState()
  const problems = instanceOwnershipProblems(state)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL  ${problem}`)
    fail('instance is not worth driving')
  }
  return state
}

async function waitHttpOk(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let last = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      last = `HTTP ${response.status}`
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(`${label} not ready at ${url} (${last})`)
}

function seedLocal() {
  console.log(
    'Seeding local D1 (overwrites local sample rows and deletes non-LOCAL members; never touches production).',
  )
  const result = spawnSync('npm', ['run', 'seed'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  fs.writeFileSync(path.join(RUN_DIR, 'seed.log'), `${result.stdout || ''}${result.stderr || ''}`)
  if (result.status !== 0) {
    fail(`npm run seed failed:\n${result.stdout}\n${result.stderr}`)
  }
}

async function cmdLaunch() {
  ensureDir(RUN_DIR)
  const existing = readState()
  if (existing && (pidAlive(existing.pids?.worker) || pidAlive(existing.pids?.web))) {
    fail('a verification instance is already running. Run cleanup first, or doctor to inspect it.')
  }

  const busy = []
  if (!portFree(WEB_PORT)) busy.push(`${WEB_PORT} (Vite)`)
  if (!portFree(WORKER_PORT)) busy.push(`${WORKER_PORT} (Worker)`)
  if (busy.length > 0) {
    fail(
      `refusing to double-drive a shared instance. Ports already listening: ${busy.join(', ')}. Stop those processes (do not kill by name) or use that session only if you started it for this run.`,
    )
  }

  if (existing) {
    fs.rmSync(RUN_DIR, { recursive: true, force: true })
    ensureDir(RUN_DIR)
  }

  writeState({
    runId: new Date().toISOString().replace(/[:.]/g, '-'),
    repoRoot: REPO_ROOT,
    webUrl: WEB_URL,
    workerUrl: WORKER_URL,
    cdpPort: CDP_PORT,
    viewport: VIEWPORT,
    seeded: false,
    pids: {},
    startedAt: new Date().toISOString(),
  })

  seedLocal()

  // `--local` disables the wrangler.toml `browser.remote = true` session.
  // UI verification does not need Browser Rendering (Senate vote-menu ingest).
  const workerPid = spawnLogged(
    'npm',
    [
      '--prefix',
      'workers/senate_data_worker',
      'run',
      'dev',
      '--',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(WORKER_PORT),
      '--show-interactive-dev-session',
      'false',
    ],
    path.join(RUN_DIR, 'worker.log'),
  )
  const webPid = spawnLogged('npm', ['run', 'dev:web'], path.join(RUN_DIR, 'web.log'))
  writeState({
    ...readState(),
    seeded: true,
    pids: { worker: workerPid, web: webPid },
  })

  try {
    await waitHttpOk(`${WORKER_URL}/health`, 90_000, 'worker')
    await waitHttpOk(WEB_URL, 60_000, 'web')
  } catch (err) {
    killPid(workerPid)
    killPid(webPid)
    fail(err instanceof Error ? err.message : String(err))
  }

  const health = await fetchJson(`${WORKER_URL}/health`)
  const feed = await fetchJson(`${WEB_URL}/feed/latest.json?limit=50&offset=0`)
  const feedCheck = seedFeedProblems(feed.body?.items)
  if (feedCheck.errors.length > 0) {
    killPid(workerPid)
    killPid(webPid)
    fail(feedCheck.errors.join('; '))
  }
  for (const warning of feedCheck.warnings) console.warn(`warn  ${warning}`)

  console.log(`launched web=${WEB_URL} worker=${WORKER_URL}`)
  console.log(`worker pid=${workerPid} web pid=${webPid}`)
  console.log(
    `health status=${health.body?.status ?? 'unknown'} feed items=${feed.body.items.length}`,
  )
  console.log('ready. Run doctor, then drive from features/.')
}

async function cmdDoctor() {
  const state = requireOwnState()
  const problems = instanceOwnershipProblems(state)

  const health = await fetchJson(`${WORKER_URL}/health`).catch((err) => ({
    ok: false,
    status: 0,
    body: String(err),
  }))
  const proxiedHealth = await fetchJson(`${WEB_URL}/health`).catch((err) => ({
    ok: false,
    status: 0,
    body: String(err),
  }))
  const feed = await fetchJson(`${WEB_URL}/feed/latest.json?limit=50&offset=0`).catch((err) => ({
    ok: false,
    status: 0,
    body: String(err),
  }))

  if (!health.ok || typeof health.body !== 'object') {
    problems.push(`worker /health failed (${health.status})`)
  } else if (health.body.congress == null || health.body.congress === '') {
    problems.push('worker /health JSON is missing congress')
  }

  if (!proxiedHealth.ok) {
    problems.push(`Vite proxy /health failed (${proxiedHealth.status}) — both servers must be up`)
  }

  let feedWarnings = []
  if (!feed.ok) {
    problems.push(`feed JSON failed (${feed.status})`)
  } else {
    const feedCheck = seedFeedProblems(feed.body?.items)
    problems.push(...feedCheck.errors)
    feedWarnings = feedCheck.warnings
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL  ${problem}`)
    fail('instance is not worth driving')
  }

  const items = feed.body.items
  const samples = sampleHeadlines(items)
  console.log(`ok    web ${WEB_URL}`)
  console.log(`ok    worker ${WORKER_URL} health=${health.body.status} congress=${health.body.congress}`)
  console.log(`ok    seeded feed items=${items.length} local-sample=${samples.length}`)
  console.log(`ok    worker pid=${state.pids.worker} web pid=${state.pids.web}`)
  for (const headline of REQUIRED_HEADLINES) {
    console.log(`ok    fixture: ${headline}`)
  }
  for (const warning of feedWarnings) console.warn(`warn  ${warning}`)
}

async function cmdApi(flags) {
  requireOwnInstance()
  const method = (flags._[0] || 'GET').toUpperCase()
  const apiPath = flags._[1]
  if (method !== 'GET') fail('api is GET-only (read-only feed/stats/health/debug)')
  if (!isAllowedApiPath(apiPath)) {
    fail('api GET path must be /feed, /stats, /health, or /debug/*.json')
  }
  const response = await fetch(`${WEB_URL}${apiPath}`, { method: 'GET' })
  const text = await response.text()
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
  if (!response.ok) process.exit(1)
}

async function ensureBrowser(state) {
  if (pidAlive(state.pids?.browser) && !portFree(state.cdpPort || CDP_PORT)) {
    return { ...state, cdpUrl: `http://127.0.0.1:${state.cdpPort || CDP_PORT}` }
  }

  if (!portFree(CDP_PORT)) {
    fail(`CDP port ${CDP_PORT} is already in use. Refusing to attach to a shared Chrome.`)
  }

  const { chromium } = await import('playwright')
  let executable
  try {
    executable = chromium.executablePath()
    if (!fs.existsSync(executable)) throw new Error('missing')
  } catch {
    const install = spawnSync('npx', ['playwright', 'install', 'chromium'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    if (install.status !== 0) {
      fail(`Playwright Chromium is not installed. Ran playwright install chromium:\n${install.stderr}`)
    }
    executable = chromium.executablePath()
  }

  const userDataDir = path.join(RUN_DIR, 'chrome-profile')
  ensureDir(userDataDir)
  const browserPid = spawnLogged(
    executable,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    path.join(RUN_DIR, 'browser.log'),
  )
  await waitForPort(CDP_PORT, 20_000)
  const next = {
    ...state,
    cdpPort: CDP_PORT,
    cdpUrl: `http://127.0.0.1:${CDP_PORT}`,
    pids: { ...state.pids, browser: browserPid },
  }
  writeState(next)
  return next
}

async function withPage(fn) {
  const state = requireOwnInstance()
  const ready = await ensureBrowser(state)
  const { chromium } = await import('playwright')
  const browser = await chromium.connectOverCDP(ready.cdpUrl)
  const context = browser.contexts()[0] || (await browser.newContext())
  let page = context.pages().find((candidate) => candidate.url().startsWith(WEB_URL))
  if (!page) page = context.pages()[0]
  if (!page) page = await context.newPage()
  await page.setViewportSize(VIEWPORT)
  return await fn(page)
}

function getLocator(page, flags) {
  if (flags.selector) return page.locator(flags.selector)
  if (flags.role) {
    const options = {}
    if (flags.name !== undefined) options.name = parseName(flags.name)
    if (flags.exact) options.exact = true
    let locator = page.getByRole(flags.role, options)
    if (flags.nth !== undefined) locator = locator.nth(Number(flags.nth))
    return locator
  }
  if (flags.name) return page.getByLabel(parseName(flags.name))
  fail('browser action needs --role and --name, or --selector')
}

async function cmdBrowser(command, flags) {
  if (command === 'start') {
    await withPage(async (page) => {
      if (!page.url().startsWith(WEB_URL)) await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' })
      console.log(`browser ready cdp=http://127.0.0.1:${CDP_PORT} page=${page.url()}`)
    })
    return
  }

  if (command === 'goto') {
    const target = flags.url || `${WEB_URL}${flags.path || '/'}`
    if (flags.url && !isAppUrl(flags.url)) {
      fail(`goto --url must stay on ${WEB_URL}`)
    }
    await withPage(async (page) => {
      await page.goto(target, { waitUntil: 'domcontentloaded' })
      console.log(`goto ${page.url()}`)
    })
    return
  }

  if (command === 'click') {
    await withPage(async (page) => {
      await getLocator(page, flags).click()
      console.log(`clicked ${flags.role || flags.selector} ${flags.name || ''}`.trim())
    })
    return
  }

  if (command === 'fill') {
    if (flags.value === undefined) fail('fill requires --value')
    await withPage(async (page) => {
      await getLocator(page, flags).fill(flags.value)
      console.log(`filled ${flags.name || flags.selector}`)
    })
    return
  }

  if (command === 'select') {
    if (flags.value === undefined || flags.name === undefined) fail('select requires --name and --value')
    await withPage(async (page) => {
      await page.getByLabel(flags.name).selectOption(flags.value)
      console.log(`selected ${flags.name}=${flags.value}`)
    })
    return
  }

  if (command === 'press') {
    if (!flags.key) fail('press requires --key')
    await withPage(async (page) => {
      await page.keyboard.press(flags.key)
      console.log(`pressed ${flags.key}`)
    })
    return
  }

  if (command === 'wait') {
    const timeout = Number(flags['timeout-ms'] || 15_000)
    await withPage(async (page) => {
      await getLocator(page, flags).waitFor({ timeout })
      console.log(`waited for ${flags.role || flags.selector} ${flags.name || ''}`.trim())
    })
    return
  }

  if (command === 'snapshot') {
    if (!flags.aria) fail('snapshot requires --aria --path (ARIA snapshot only)')
    if (!flags.path) fail('snapshot requires --path')
    const outPath = resolveEvidencePath(flags.path)
    ensureDir(path.dirname(outPath))
    await withPage(async (page) => {
      const snapshot = await page.locator('body').ariaSnapshot()
      fs.writeFileSync(outPath, `${snapshot}\n`)
      console.log(`wrote ${outPath}`)
    })
    return
  }

  if (command === 'screenshot') {
    if (!flags.path) fail('screenshot requires --path')
    const outPath = resolveEvidencePath(flags.path)
    ensureDir(path.dirname(outPath))
    await withPage(async (page) => {
      await page.screenshot({ path: outPath, fullPage: Boolean(flags['full-page']) })
      console.log(`wrote ${outPath}`)
    })
    return
  }

  fail(`unknown browser command: ${command}`)
}

function cmdCleanup() {
  const state = readState()
  if (!state) {
    console.log('nothing to clean up (no run state).')
    console.log(`evidence directory left in place: ${EVIDENCE_ROOT}`)
    return
  }

  const pids = [state.pids?.browser, state.pids?.web, state.pids?.worker]
  for (const pid of pids) killPid(pid, 'SIGTERM')

  const deadline = Date.now() + 8_000
  while (Date.now() < deadline && anyRecordedPidAlive(state)) {
    sleepMs(200)
  }

  if (anyRecordedPidAlive(state)) {
    for (const pid of pids) killPid(pid, 'SIGKILL')
    sleepMs(400)
  }

  const stillAlive = anyRecordedPidAlive(state)
  const portsBusy = !portFree(WEB_PORT) || !portFree(WORKER_PORT) || !portFree(CDP_PORT)
  if (stillAlive || portsBusy) {
    fail(
      `cleanup could not free the instance (pids alive=${stillAlive} ports busy=${portsBusy}). State kept at ${STATE_PATH}.`,
    )
  }

  fs.rmSync(RUN_DIR, { recursive: true, force: true })
  console.log('stopped verification worker, web, and browser.')
  console.log(`evidence retained at ${EVIDENCE_ROOT} (feature folders only; .run removed).`)
}

export const TEST_ONLY = {
  parseArgs,
  parseName,
  isAllowedApiPath,
  resolveEvidencePath,
  seedFeedProblems,
  ENERGY_HEADLINE,
  REQUIRED_HEADLINES,
  EVIDENCE_ROOT,
}

async function main(argv) {
  const command = argv.shift()
  if (!command) usage()
  const flags = parseArgs(argv)

  if (command === 'launch') await cmdLaunch()
  else if (command === 'doctor') await cmdDoctor()
  else if (command === 'cleanup') cmdCleanup()
  else if (command === 'api') await cmdApi(flags)
  else if (command === 'browser') {
    const sub = flags._.shift()
    if (!sub) usage()
    await cmdBrowser(sub, flags)
  } else usage()
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) {
  try {
    await main(process.argv.slice(2))
    // Do not browser.close() after connectOverCDP — that sends CDP Browser.close
    // and kills Chromium. Exit so the open CDP socket cannot keep this process.
    process.exit(0)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
}
