import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.mjs'
import {
  describeLocator,
  isAllowedCdpMethod,
  jsLooksLikeNavigation,
  parseName,
} from '../lib/browser.mjs'
import {
  endpointsFromState,
  isAllowedAppUrl,
  resolveEndpoints,
  seedEnvFor,
  viteEnvFor,
  webDevArgs,
  workerArgsFor,
} from '../lib/endpoints.mjs'
import { ENERGY_HEADLINE, isAllowedApiPath, REQUIRED_HEADLINES, seedFeedProblems } from '../lib/feed.mjs'
import {
  killPid,
  listenerLooksLikeVerification,
  pidAlive,
  portOwnershipProblem,
  teardownPids,
} from '../lib/process.mjs'
import { TEST_ONLY } from './verify-congress-tracker.mjs'

test('corrupt-state cleanup only claims listeners that visibly belong to a verification run', () => {
  const runDir = '/repo/artifacts/verify/.run'
  const shims = (lines) => ({
    commandLine: (pid) => lines[pid] ?? '',
    ancestorPids: (pid) => (pid === 10 ? [9] : []),
  })
  const wrangler = shims({ 10: `node wrangler dev --local --persist-to ${runDir}/d1` })
  assert.equal(listenerLooksLikeVerification(10, runDir, wrangler), true)
  const viaParent = shims({ 10: 'node worker-child', 9: `chrome --user-data-dir=${runDir}/chrome-profile` })
  assert.equal(listenerLooksLikeVerification(10, runDir, viaParent), true)
  const vite = shims({ 10: 'node web/node_modules/.bin/vite' })
  assert.equal(listenerLooksLikeVerification(10, runDir, { ...vite, isWebPort: true }), false)
  const viteMode = shims({ 10: 'node web/node_modules/.bin/vite --mode verify-congress-tracker' })
  assert.equal(listenerLooksLikeVerification(10, runDir, { ...viteMode, isWebPort: true }), true)
  assert.equal(listenerLooksLikeVerification(10, runDir, viteMode), false)
  const stranger = shims({ 10: 'python -m http.server 5174' })
  assert.equal(listenerLooksLikeVerification(10, runDir, { ...stranger, isWebPort: true }), false)
})

const here = path.dirname(fileURLToPath(import.meta.url))
const helper = path.join(here, 'verify-congress-tracker')
const rootDir = path.resolve(here, '../../../..')
const seedScript = path.join(rootDir, 'scripts', 'seed-local-feed.sh')
const { resolveEvidencePath, EVIDENCE_ROOT, PERSIST_TO, viewportFromState } = TEST_ONLY

test('helper wrapper is executable', () => {
  const stat = fs.statSync(helper)
  assert.ok((stat.mode & 0o111) !== 0)
})

test('usage documents selector, nth, GET-only api, and DevTools commands', () => {
  try {
    execFileSync(helper, [], { encoding: 'utf8' })
    assert.fail('expected usage exit')
  } catch (err) {
    assert.equal(err.status, 2)
    const text = `${err.stdout ?? ''}${err.stderr ?? ''}`
    assert.match(text, /--selector/)
    assert.match(text, /--nth N/)
    assert.match(text, /api GET/)
    assert.match(text, /snapshot --aria/)
    assert.match(text, /browser eval/)
    assert.match(text, /browser cdp/)
    assert.match(text, /browser console/)
    assert.match(text, /browser network/)
    assert.match(text, /browser url/)
    assert.match(text, /browser find/)
    assert.match(text, /browser scroll/)
    assert.match(text, /start Chromium/)
    assert.match(text, /--name <label>/)
    assert.match(text, /fill .*\[--nth N\]/)
    assert.match(text, /select .*\[--nth N\]/)
  }
})

test('parseName treats /pattern/ as a regex', () => {
  const flags = parseArgs(['--name', '/House passes a broad energy permitting/', '--nth', '0'])
  assert.equal(String(parseName(flags.name)), '/House passes a broad energy permitting/')
  assert.equal(flags.nth, '0')
})

test('parseArgs throws when a flag is missing its value', () => {
  assert.throws(() => parseArgs(['--js']), /missing value for --js/)
  assert.throws(() => parseArgs(['--method', '--params', '{}']), /missing value for --method/)
})

test('describeLocator applies nth to selector and rejects a bad nth', () => {
  assert.deepEqual(describeLocator({ selector: '.feed-row', nth: '1' }), {
    kind: 'selector',
    selector: '.feed-row',
    nth: 1,
  })
  assert.throws(() => describeLocator({ selector: '.feed-row', nth: '-1' }), /non-negative integer/)
  assert.throws(() => describeLocator({ name: 'House', nth: 'x' }), /non-negative integer/)
})

test('api paths are read-only public JSON', () => {
  assert.equal(isAllowedApiPath('/feed/latest.json?limit=50&offset=0'), true)
  assert.equal(isAllowedApiPath('/stats/session.json'), true)
  assert.equal(isAllowedApiPath('/health'), true)
  assert.equal(isAllowedApiPath('/debug/ingest.json'), true)
  assert.equal(isAllowedApiPath('/__pipeline/run/feed'), false)
  assert.equal(isAllowedApiPath('/@fs/workers/senate_data_worker/.dev.vars'), false)
  assert.equal(isAllowedApiPath('/feed/../@fs/workers/senate_data_worker/.dev.vars'), false)
  assert.equal(isAllowedApiPath('https://example.com/feed'), false)
})

test('browser commands reuse a persisted CDP viewport instead of resetting to 1280', () => {
  assert.deepEqual(viewportFromState({ viewport: { width: 390, height: 844 } }), {
    width: 390,
    height: 844,
  })
  assert.deepEqual(viewportFromState({ viewport: { width: 320, height: 568 } }), {
    width: 320,
    height: 568,
  })
  assert.deepEqual(viewportFromState({}), { width: 1280, height: 800 })
})

test('evidence paths cannot escape artifacts/verify', () => {
  const ok = resolveEvidencePath('artifacts/verify/feed-timeline/home.png')
  assert.equal(ok, path.join(EVIDENCE_ROOT, 'feed-timeline', 'home.png'))
  assert.throws(() => resolveEvidencePath('/tmp/x.png'), /stay under artifacts\/verify/)
  assert.throws(() => resolveEvidencePath('../../.ssh/authorized_keys'), /stay under artifacts\/verify/)
})

test('app URLs reject Vite internals, traversal, and off-origin targets', () => {
  const webUrl = 'http://127.0.0.1:5174'
  assert.equal(isAllowedAppUrl('/', webUrl), true)
  assert.equal(isAllowedAppUrl('/?bill=119-hr-1', webUrl), true)
  assert.equal(isAllowedAppUrl('/debug', webUrl), true)
  assert.equal(isAllowedAppUrl('http://127.0.0.1:5174/?q=energy', webUrl), true)
  assert.equal(isAllowedAppUrl('/@fs/x', webUrl), false)
  assert.equal(isAllowedAppUrl('/x/../@fs/x', webUrl), false)
  assert.equal(isAllowedAppUrl('/./@fs/x', webUrl), false)
  assert.equal(isAllowedAppUrl('/%40fs/x', webUrl), false)
  assert.equal(isAllowedAppUrl('/node_modules/a', webUrl), false)
  assert.equal(isAllowedAppUrl('/src/../.env', webUrl), false)
  assert.equal(isAllowedAppUrl('http://127.0.0.1:5174/@fs/x', webUrl), false)
  assert.equal(isAllowedAppUrl('http://evil/', webUrl), false)
  assert.equal(isAllowedAppUrl('foo', webUrl), false)
})

test('seeded feed must include the required headlines; mixed live rows are errors', () => {
  const sample = (headline) => ({ digest: { headline } })
  const items = REQUIRED_HEADLINES.map(sample)
  assert.deepEqual(seedFeedProblems(items), [])
  assert.deepEqual(seedFeedProblems([]), ['feed has no items'])
  const mixed = seedFeedProblems([...REQUIRED_HEADLINES.map(sample), { digest: { headline: 'Live Act' } }])
  assert.match(mixed[0], /mixed/)
  assert.match(
    seedFeedProblems([sample(ENERGY_HEADLINE), sample(REQUIRED_HEADLINES[1])])[0],
    /missing required sample headline/,
  )
})

test('required headlines appear in seed SQL', () => {
  const sql = execFileSync('bash', [seedScript], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, SEED_PRINT_SQL: '1' },
  })
  for (const headline of REQUIRED_HEADLINES) {
    assert.ok(sql.includes(headline), `seed SQL must include ${headline}`)
  }
})

test('CDP method allowlist permits inspect domains and denies Browser/Input/navigate', () => {
  assert.equal(isAllowedCdpMethod('Runtime.evaluate'), true)
  assert.equal(isAllowedCdpMethod('DOM.getDocument'), true)
  assert.equal(isAllowedCdpMethod('Page.captureScreenshot'), true)
  assert.equal(isAllowedCdpMethod('Page.getLayoutMetrics'), true)
  assert.equal(isAllowedCdpMethod('Browser.close'), false)
  assert.equal(isAllowedCdpMethod('Input.dispatchMouseEvent'), false)
  assert.equal(isAllowedCdpMethod('Page.navigate'), false)
  assert.equal(isAllowedCdpMethod('Target.createTarget'), false)
  assert.equal(isAllowedCdpMethod('Runtime.compileScript'), false)
  assert.equal(isAllowedCdpMethod('Runtime.runScript'), false)
})

test('eval navigation guard catches location bracket assignment', () => {
  assert.equal(jsLooksLikeNavigation("location['href'] = '/'"), true)
  assert.equal(jsLooksLikeNavigation('location["href"] = "/"'), true)
  assert.equal(jsLooksLikeNavigation("window['location'] = '/'"), true)
  assert.equal(jsLooksLikeNavigation('document["location"] = "/"'), true)
  assert.equal(jsLooksLikeNavigation('document.title'), false)
})

test('invalid VERIFY_* ports fail closed', () => {
  assert.throws(() => resolveEndpoints({ VERIFY_WEB_PORT: 'nope' }), /invalid VERIFY_WEB_PORT/)
  assert.throws(() => resolveEndpoints({ VERIFY_WORKER_PORT: '0' }), /invalid VERIFY_WORKER_PORT/)
})

test('endpointsFromState requires recorded fields and does not fall back', () => {
  const full = {
    webUrl: 'http://127.0.0.1:5174',
    workerUrl: 'http://127.0.0.1:8788',
    webPort: 5174,
    workerPort: 8788,
    cdpPort: 9223,
  }
  assert.deepEqual(endpointsFromState(full), full)
  assert.throws(() => endpointsFromState({ webUrl: full.webUrl }), /missing endpoint fields/)
  assert.throws(() => endpointsFromState({ ...full, webPort: 'nope' }), /invalid webPort/)
  const defaults = endpointsFromState(null, {})
  assert.equal(defaults.webPort, 5174)
})

test('dead recorded Chrome is not an ownership problem when CDP is free', () => {
  assert.equal(
    portOwnershipProblem(9223, 99999, {
      requireListener: false,
      listenersOnPort: () => [],
      listenerOwnedBy: () => false,
    }),
    null,
  )
  assert.match(
    portOwnershipProblem(9223, 111, {
      requireListener: false,
      listenersOnPort: () => [222],
      listenerOwnedBy: () => false,
    }),
    /held by pid 222/,
  )
  assert.equal(
    portOwnershipProblem(9223, 111, {
      requireListener: false,
      listenersOnPort: () => [111],
      listenerOwnedBy: (listener, recorded) => listener === recorded,
    }),
    null,
  )
})

test('launch seeds and serves isolated persist-to D1', () => {
  const endpoints = resolveEndpoints({})
  const args = workerArgsFor(endpoints, PERSIST_TO)
  assert.ok(args.includes('--local'))
  assert.ok(args.includes('--persist-to'))
  assert.equal(args[args.indexOf('--persist-to') + 1], PERSIST_TO)
  assert.ok(PERSIST_TO.endsWith(`${path.sep}artifacts${path.sep}verify${path.sep}.run${path.sep}d1`))
  assert.ok(!args.includes('--remote'))
  assert.deepEqual(seedEnvFor(PERSIST_TO), { SEED_PERSIST_TO: PERSIST_TO })
})

test('verification stack uses dedicated ports beside the human dev stack', () => {
  const defaults = resolveEndpoints({})
  assert.equal(defaults.webPort, 5174)
  assert.equal(defaults.workerPort, 8788)
  assert.equal(defaults.cdpPort, 9223)
  assert.equal(defaults.webUrl, 'http://127.0.0.1:5174')
  assert.equal(defaults.workerUrl, 'http://127.0.0.1:8788')
  const override = resolveEndpoints({
    VERIFY_WEB_PORT: '6100',
    VERIFY_WORKER_PORT: '6101',
    VERIFY_CDP_PORT: '6102',
  })
  assert.equal(override.webPort, 6100)
  assert.equal(override.workerPort, 6101)
  assert.equal(override.cdpPort, 6102)
  assert.deepEqual(viteEnvFor(override), {
    VITE_DEV_PORT: '6100',
    VITE_WORKER_ORIGIN: 'http://127.0.0.1:6101',
  })
  const args = workerArgsFor(override, PERSIST_TO)
  assert.equal(args[args.indexOf('--port') + 1], '6101')
  assert.deepEqual(webDevArgs(), ['run', 'dev:web', '--', '--mode', 'verify-congress-tracker'])
})

test('teardownPids kills a process group whose recorded leader already exited', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-teardown-'))
  const pidFile = path.join(dir, 'child.pid')
  let leaderPid = 0
  let childPid = 0
  try {
    // Leader (sh) forks a long-lived node child into its process group, then exits.
    const leader = spawn(
      'sh',
      ['-c', `node -e "setInterval(() => {}, 1000)" & echo $! > "${pidFile}"; exit 0`],
      { detached: true, stdio: 'ignore' },
    )
    leader.unref()
    leaderPid = leader.pid
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('leader did not exit')), 5000)
      leader.once('error', reject)
      leader.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    childPid = await waitFor(() => {
      const text = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8').trim() : ''
      return /^\d+$/.test(text) ? Number(text) : 0
    }, 'child pid file')
    assert.equal(pidAlive(leaderPid), false)
    assert.equal(pidAlive(childPid), true)

    assert.deepEqual(teardownPids([leaderPid], { graceMs: 3000 }), [])
    // The orphan is reparented to init/launchd; kill(pid, 0) still succeeds on the zombie
    // until it is reaped, so wait for that instead of asserting instantly.
    await waitFor(() => !pidAlive(childPid), 'orphaned group member to die')
  } finally {
    if (leaderPid > 1) killPid(leaderPid, 'SIGKILL')
    if (childPid > 1) killPid(childPid, 'SIGKILL')
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

async function waitFor(probe, what, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
