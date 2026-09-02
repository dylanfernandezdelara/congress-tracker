#!/usr/bin/env node
/**
 * Launch, doctor, drive, and clean up a local Congress Tracker instance.
 * Evidence lives under artifacts/verify/<feature>/ and is never deleted by cleanup.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseArgs, UsageError } from '../lib/args.mjs'
import { runBrowserCommand } from '../lib/browser.mjs'
import {
  DEFAULT_CDP_PORT,
  DEFAULT_WEB_PORT,
  DEFAULT_WORKER_PORT,
  endpointsFromState,
  isAllowedAppUrl,
  resolveEndpoints,
  seedEnvFor,
  viteEnvFor,
  webDevArgs,
  workerArgsFor,
} from '../lib/endpoints.mjs'
import {
  isAllowedApiPath,
  REQUIRED_HEADLINES,
  sampleHeadlines,
  seedFeedProblems,
} from '../lib/feed.mjs'
import {
  listenerLooksLikeVerification,
  listenersOnPort,
  pidAlive,
  portFree,
  portOwnershipProblem,
  recordedPids,
  spawnLogged,
  teardownPids,
  waitForPort,
} from '../lib/process.mjs'
import { createStateStore, salvageEndpointsFromText, salvagePidsFromText } from '../lib/run-state.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(here, '../../../..')
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'artifacts', 'verify')
const RUN_DIR = path.join(EVIDENCE_ROOT, '.run')
const STATE_PATH = path.join(RUN_DIR, 'state.json')
const PERSIST_TO = path.join(RUN_DIR, 'd1')
const CONSOLE_JSONL = path.join(RUN_DIR, 'console.jsonl')
const NETWORK_JSONL = path.join(RUN_DIR, 'network.jsonl')
const TAP_SCRIPT = path.join(here, '../lib/devtools-tap.mjs')
const VIEWPORT = { width: 1280, height: 800 }
const { readState, writeState, updateState, readStateOrCorrupt } = createStateStore(STATE_PATH)

function usage() {
  console.error(`Usage:
  verify-congress-tracker launch
  verify-congress-tracker doctor
  verify-congress-tracker cleanup
  verify-congress-tracker api GET <path>
  verify-congress-tracker browser start
  verify-congress-tracker browser goto [--path /] [--url <url>]
  verify-congress-tracker browser url
  verify-congress-tracker browser find (--role <role> --name <name> | --selector <sel>) [--exact]
  verify-congress-tracker browser scroll (--role <role> --name <name> | --selector <sel>) [--exact] [--nth N]
  verify-congress-tracker browser click (--role <role> --name <name> | --selector <sel>) [--exact] [--nth N]
  verify-congress-tracker browser fill (--role <role> --name <name> | --selector <sel>) --value <value> [--exact] [--nth N]
  verify-congress-tracker browser select (--role <role> --name <name> | --name <label> | --selector <sel>) --value <value> [--exact] [--nth N]
  verify-congress-tracker browser press --key <key>
  verify-congress-tracker browser wait (--role <role> --name <name> | --selector <sel>) [--exact] [--nth N] [--timeout-ms 15000]
  verify-congress-tracker browser eval --js <expression>
  verify-congress-tracker browser cdp --method <CDP.Method> [--params <json-object>]
  verify-congress-tracker browser console
  verify-congress-tracker browser network
  verify-congress-tracker browser snapshot --aria [--path <file-under-artifacts/verify>]
  verify-congress-tracker browser screenshot --path <file-under-artifacts/verify> [--full-page]

  api GET is read-only and limited to /feed, /stats, /health, and /debug/*.json.
  --name /regex/ is a JavaScript regex. Snapshot writes an ARIA snapshot to stdout or --path (--aria is required).
  browser console and browser network start Chromium + the DevTools tap if needed.
`)
  throw new UsageError()
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function waitForFile(filePath, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${label} did not become ready (${filePath})`)
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

function requireOwnState() {
  const state = readState()
  if (!state) {
    throw new Error(
      `no verification instance is recorded at ${STATE_PATH}. Run launch first. Do not drive a shared or pre-existing server.`,
    )
  }
  return state
}

function instanceOwnershipProblems(state) {
  const { webPort, workerPort, cdpPort } = endpointsFromState(state)
  const problems = []
  if (!pidAlive(state.pids?.worker)) problems.push(`worker pid ${state.pids?.worker} is not running`)
  if (!pidAlive(state.pids?.web)) problems.push(`web pid ${state.pids?.web} is not running`)
  if (!state.seeded) problems.push('launch did not record a successful seed')
  const webHeld = portOwnershipProblem(webPort, state.pids?.web)
  const workerHeld = portOwnershipProblem(workerPort, state.pids?.worker)
  if (webHeld) problems.push(webHeld)
  if (workerHeld) problems.push(workerHeld)
  const cdpHeld = portOwnershipProblem(cdpPort, state.pids?.browser, { requireListener: false })
  if (cdpHeld) problems.push(cdpHeld)
  return problems
}

function requireOwnInstance() {
  const state = requireOwnState()
  const problems = instanceOwnershipProblems(state)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL  ${problem}`)
    throw new Error('instance is not worth driving')
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

function seedLocal(persistTo) {
  console.log(
    'Seeding isolated verification D1 (SEED_PERSIST_TO artifacts/verify/.run/d1; never touches .wrangler/state or production/preview D1).',
  )
  const result = spawnSync('npm', ['run', 'seed'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...seedEnvFor(persistTo) },
  })
  fs.writeFileSync(path.join(RUN_DIR, 'seed.log'), `${result.stdout || ''}${result.stderr || ''}`)
  if (result.status !== 0) {
    throw new Error(`npm run seed failed:\n${result.stdout}\n${result.stderr}`)
  }
}

async function cmdLaunch() {
  ensureDir(RUN_DIR)
  const existing = readState()
  if (existing && recordedPids(existing).some((pid) => pidAlive(pid))) {
    throw new Error(
      'a verification instance is already running. Run cleanup first, or doctor to inspect it.',
    )
  }

  const endpoints = resolveEndpoints()
  const busy = []
  if (!portFree(endpoints.webPort)) busy.push(`${endpoints.webPort} (Vite)`)
  if (!portFree(endpoints.workerPort)) busy.push(`${endpoints.workerPort} (Worker)`)
  if (!portFree(endpoints.cdpPort)) busy.push(`${endpoints.cdpPort} (CDP)`)
  if (busy.length > 0) {
    throw new Error(
      `verification ports already listening: ${busy.join(', ')}. These are the verification ports (default ${DEFAULT_WEB_PORT}/${DEFAULT_WORKER_PORT}/${DEFAULT_CDP_PORT}); the user's 5173/8787 stack is untouched. Stop the leftover verification process (do not kill by name) or run cleanup.`,
    )
  }

  if (existing) {
    teardownPids(recordedPids(existing))
    fs.rmSync(RUN_DIR, { recursive: true, force: true })
    ensureDir(RUN_DIR)
  }

  ensureDir(PERSIST_TO)
  writeState({
    runId: new Date().toISOString().replace(/[:.]/g, '-'),
    repoRoot: REPO_ROOT,
    ...endpoints,
    viewport: VIEWPORT,
    persistTo: PERSIST_TO,
    seeded: false,
    pids: {},
    startedAt: new Date().toISOString(),
  })

  seedLocal(PERSIST_TO)
  updateState({ seeded: true, persistTo: PERSIST_TO, ...endpoints })

  const workerPid = spawnLogged(
    'npm',
    workerArgsFor(endpoints, PERSIST_TO),
    path.join(RUN_DIR, 'worker.log'),
    { cwd: REPO_ROOT },
  )
  updateState({ pids: { worker: workerPid } })
  const webPid = spawnLogged('npm', webDevArgs(), path.join(RUN_DIR, 'web.log'), {
    cwd: REPO_ROOT,
    extraEnv: viteEnvFor(endpoints),
  })
  updateState({ pids: { web: webPid } })

  try {
    await waitHttpOk(`${endpoints.workerUrl}/health`, 90_000, 'worker')
    await waitHttpOk(endpoints.webUrl, 60_000, 'web')
  } catch (err) {
    teardownPids(recordedPids(readState()))
    throw err
  }

  const health = await fetchJson(`${endpoints.workerUrl}/health`)
  const feed = await fetchJson(`${endpoints.webUrl}/feed/latest.json?limit=50&offset=0`)
  const feedErrors = seedFeedProblems(feed.body?.items)
  if (feedErrors.length > 0) {
    teardownPids(recordedPids(readState()))
    throw new Error(feedErrors.join('; '))
  }

  console.log(`launched web=${endpoints.webUrl} worker=${endpoints.workerUrl}`)
  console.log(`worker pid=${workerPid} web pid=${webPid}`)
  console.log(`persist-to ${PERSIST_TO}`)
  console.log(
    `health status=${health.body?.status ?? 'unknown'} feed items=${feed.body.items.length}`,
  )
  console.log('ready. Run doctor, then drive from features/.')
}

async function cmdDoctor() {
  const state = requireOwnState()
  const { webUrl, workerUrl } = endpointsFromState(state)
  const problems = instanceOwnershipProblems(state)

  const health = await fetchJson(`${workerUrl}/health`).catch((err) => ({
    ok: false,
    status: 0,
    body: String(err),
  }))
  const proxiedHealth = await fetchJson(`${webUrl}/health`).catch((err) => ({
    ok: false,
    status: 0,
    body: String(err),
  }))
  const feed = await fetchJson(`${webUrl}/feed/latest.json?limit=50&offset=0`).catch((err) => ({
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
  if (!feed.ok) problems.push(`feed JSON failed (${feed.status})`)
  else problems.push(...seedFeedProblems(feed.body?.items))

  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL  ${problem}`)
    throw new Error('instance is not worth driving')
  }

  const items = feed.body.items
  const samples = sampleHeadlines(items)
  console.log(`ok    web ${webUrl}`)
  console.log(`ok    worker ${workerUrl} health=${health.body.status} congress=${health.body.congress}`)
  console.log(`ok    seeded feed items=${items.length} local-sample=${samples.length}`)
  console.log(`ok    persist-to ${state.persistTo || PERSIST_TO}`)
  console.log(`ok    worker pid=${state.pids.worker} web pid=${state.pids.web}`)
  for (const headline of REQUIRED_HEADLINES) console.log(`ok    fixture: ${headline}`)
}

async function cmdApi(flags) {
  const state = requireOwnInstance()
  const { webUrl } = endpointsFromState(state)
  const method = (flags._[0] || 'GET').toUpperCase()
  const apiPath = flags._[1]
  if (method !== 'GET') throw new Error('api is GET-only (read-only feed/stats/health/debug)')
  if (!isAllowedApiPath(apiPath)) {
    throw new Error('api GET path must be /feed, /stats, /health, or /debug/*.json')
  }
  const response = await fetch(`${webUrl}${apiPath}`, { method: 'GET' })
  const text = await response.text()
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
  if (!response.ok) throw new Error(`api GET ${apiPath} failed: HTTP ${response.status}`)
}

async function ensureTap(state) {
  const { cdpPort } = endpointsFromState(state)
  if (pidAlive(state.pids?.tap) && fs.existsSync(CONSOLE_JSONL)) return readState() || state
  const tapPid = spawnLogged(
    'node',
    [TAP_SCRIPT, '--cdp-url', `http://127.0.0.1:${cdpPort}`, '--out-dir', RUN_DIR],
    path.join(RUN_DIR, 'tap.log'),
    { cwd: REPO_ROOT },
  )
  const next = updateState({ pids: { tap: tapPid } })
  try {
    await waitForFile(CONSOLE_JSONL, 25_000, 'devtools tap')
  } catch (err) {
    teardownPids([tapPid])
    throw err
  }
  return next
}

async function ensureBrowser(state) {
  const { cdpPort } = endpointsFromState(state)
  if (pidAlive(state.pids?.browser) && !portFree(cdpPort)) {
    return ensureTap(updateState({ cdpPort, cdpUrl: `http://127.0.0.1:${cdpPort}` }))
  }
  if (!portFree(cdpPort)) {
    throw new Error(`CDP port ${cdpPort} is already in use. Refusing to attach to a shared Chrome.`)
  }
  if (state.pids?.tap) {
    teardownPids([state.pids.tap])
    state = updateState({ pids: { tap: undefined } })
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
      throw new Error(
        `Playwright Chromium is not installed. Ran playwright install chromium:\n${install.stderr}`,
      )
    }
    executable = chromium.executablePath()
  }

  const userDataDir = path.join(RUN_DIR, 'chrome-profile')
  ensureDir(userDataDir)
  const headed = process.env.VERIFY_HEADED === '1'
  const chromeArgs = [
    `--remote-debugging-port=${cdpPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ]
  // Containers (Cursor Cloud) run as root without a user namespace.
  if (process.platform === 'linux') chromeArgs.push('--no-sandbox')
  if (!headed) {
    chromeArgs.push('--headless=new')
    chromeArgs.push('--disable-gpu')
  }
  chromeArgs.push('about:blank')
  const browserPid = spawnLogged(executable, chromeArgs, path.join(RUN_DIR, 'browser.log'), {
    cwd: REPO_ROOT,
  })
  updateState({ cdpPort, cdpUrl: `http://127.0.0.1:${cdpPort}`, pids: { browser: browserPid } })
  try {
    await waitForPort(cdpPort, 20_000)
  } catch (err) {
    teardownPids([browserPid])
    throw err
  }
  return ensureTap(readState() || state)
}

async function withPage(fn) {
  const ready = await ensureBrowser(requireOwnInstance())
  const { webUrl } = endpointsFromState(ready)
  const { chromium } = await import('playwright')
  const browser = await chromium.connectOverCDP(ready.cdpUrl)
  const context = browser.contexts()[0] || (await browser.newContext())
  let page = context.pages().find((candidate) => isAllowedAppUrl(candidate.url(), webUrl))
  if (!page) {
    const disallowed = context.pages().find((candidate) => {
      try {
        return new URL(candidate.url()).origin === new URL(webUrl).origin
      } catch {
        return false
      }
    })
    if (disallowed) {
      await disallowed.goto(webUrl, { waitUntil: 'domcontentloaded' })
      await disallowed.setViewportSize(VIEWPORT)
      throw new Error('page was on a disallowed URL; restored to home')
    }
    page = await context.newPage()
    await page.goto(webUrl, { waitUntil: 'domcontentloaded' })
  }
  await page.setViewportSize(VIEWPORT)
  return await fn(page)
}

async function cmdBrowser(command, flags) {
  const endpoints = endpointsFromState(requireOwnState())
  await runBrowserCommand(command, flags, {
    withPage,
    resolveEvidencePath,
    WEB_URL: endpoints.webUrl,
    CDP_PORT: endpoints.cdpPort,
    consoleLogPath: CONSOLE_JSONL,
    networkLogPath: NETWORK_JSONL,
  })
}

function cmdCleanup() {
  const { state, corrupt } = readStateOrCorrupt()
  if (!state && !corrupt) {
    console.log('nothing to clean up (no run state).')
    console.log(`evidence directory left in place: ${EVIDENCE_ROOT}`)
    return
  }

  const raw = fs.existsSync(STATE_PATH) ? fs.readFileSync(STATE_PATH, 'utf8') : ''
  let endpoints
  if (state && !corrupt) {
    try {
      endpoints = endpointsFromState(state)
    } catch {
      endpoints = resolveEndpoints()
    }
  } else {
    const defaults = resolveEndpoints()
    const salvaged = salvageEndpointsFromText(raw)
    const webPort = salvaged.webPort ?? defaults.webPort
    const workerPort = salvaged.workerPort ?? defaults.workerPort
    const cdpPort = salvaged.cdpPort ?? defaults.cdpPort
    endpoints = {
      webPort,
      workerPort,
      cdpPort,
      webUrl: `http://127.0.0.1:${webPort}`,
      workerUrl: `http://127.0.0.1:${workerPort}`,
    }
  }
  // Always sweep the ports too: a recorded npm leader can die and leave its Vite/wrangler/
  // Chromium children listening, in which case the recorded pids alone free nothing.
  const portPids = [endpoints.webPort, endpoints.workerPort, endpoints.cdpPort].flatMap((port) =>
    listenersOnPort(port).filter((pid) =>
      listenerLooksLikeVerification(pid, RUN_DIR, { isWebPort: port === endpoints.webPort }),
    ),
  )
  const pids = [
    ...new Set([
      ...(state && !corrupt ? recordedPids(state) : []),
      ...salvagePidsFromText(raw),
      ...portPids,
    ]),
  ]
  const leftover = teardownPids(pids)
  const holders = [endpoints.webPort, endpoints.workerPort, endpoints.cdpPort].flatMap((port) => {
    const listeners = listenersOnPort(port)
    return listeners.length > 0 ? [`${port} (pid ${listeners.join(',')})`] : []
  })
  if (leftover.length > 0 || holders.length > 0) {
    throw new Error(
      `cleanup could not free the instance (pids alive=${leftover.length > 0} ports ${holders.join(', ') || 'busy'}). State kept at ${STATE_PATH}.`,
    )
  }

  fs.rmSync(RUN_DIR, { recursive: true, force: true })
  console.log('stopped verification worker, web, browser, and tap.')
  console.log(`evidence retained at ${EVIDENCE_ROOT} (feature folders only; .run removed).`)
}

export const TEST_ONLY = {
  resolveEvidencePath,
  EVIDENCE_ROOT,
  PERSIST_TO,
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
    if (err instanceof UsageError) process.exit(2)
    console.error(`verify-congress-tracker: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}
