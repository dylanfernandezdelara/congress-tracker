import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.mjs'
import {
  ACCESSIBLE_NAME_MAX,
  collectInteractiveInPage,
  describeLocator,
  formatActionTarget,
  formatInteractiveLine,
  getLocator,
  INTERACTIVE_ROLES,
  isAllowedCdpMethod,
  jsLooksLikeNavigation,
  normalizeRef,
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
import {
  applyViewport,
  DEFAULT_METRICS,
  deviceMetricsFromState,
  normalizeMetrics,
  parseViewportFlags,
  viewportFromCdpFlags,
} from '../lib/viewport.mjs'
import { FALLBACK_WEB_DIST_HTML, ensureWebDistPlaceholder } from '../lib/web-dist-placeholder.mjs'
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
const { resolveEvidencePath, EVIDENCE_ROOT, PERSIST_TO } = TEST_ONLY

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
    assert.match(text, /snapshot \(--aria \| --interactive\)/)
    assert.match(text, /browser eval/)
    assert.match(text, /browser cdp/)
    assert.match(text, /browser viewport/)
    assert.match(text, /browser console/)
    assert.match(text, /browser network/)
    assert.match(text, /browser url/)
    assert.match(text, /browser find/)
    assert.match(text, /browser scroll/)
    assert.match(text, /start Chromium/)
    assert.match(text, /--name <label>/)
    assert.match(text, /--ref/)
    assert.match(text, /fill \(--role/)
    assert.match(text, /browser find.*--ref/)
    assert.match(text, /browser scroll.*--ref/)
    assert.match(text, /browser wait.*--ref/)
    assert.match(text, /browser select.*--ref/)
    assert.match(text, /select .*--value/)
    assert.match(text, /searchbox/)
    assert.doesNotMatch(text, /--ref <ref>\) \[--exact\]/)
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

test('describeLocator and normalizeRef accept @eN snapshot refs', () => {
  assert.deepEqual(describeLocator({ ref: '@e12' }), { kind: 'ref', ref: 'e12' })
  assert.throws(
    () => describeLocator({ ref: 'e3', role: 'button', name: 'House' }),
    /--ref cannot be combined with --role\/--name\/--selector\/--nth\/--exact/,
  )
  assert.throws(
    () => describeLocator({ ref: 'e3', selector: '.feed-row' }),
    /--ref cannot be combined/,
  )
  assert.throws(() => describeLocator({ ref: 'e3', nth: '0' }), /--ref cannot be combined/)
  assert.throws(() => describeLocator({ ref: 'e3', exact: true }), /--ref cannot be combined/)
  assert.equal(normalizeRef('@e1'), 'e1')
  assert.equal(normalizeRef('e9'), 'e9')
  assert.throws(() => normalizeRef('12'), /invalid ref/)
  assert.throws(() => normalizeRef(''), /ref is required/)
  assert.equal(formatActionTarget({ ref: '@e12' }), '--ref e12')
  assert.equal(formatActionTarget({ role: 'button', name: 'House' }), 'button House')
  assert.equal(formatActionTarget({ selector: '.feed-row' }), '.feed-row')
})

test('interactive snapshot lines are compact and include set state', () => {
  assert.equal(
    formatInteractiveLine({
      ref: 'e1',
      role: 'button',
      name: 'Open profile for Rep. Sample Crossover (local)',
      expanded: 'false',
    }),
    '[e1] button "Open profile for Rep. Sample Crossover (local)" (collapsed)',
  )
  assert.equal(
    formatInteractiveLine({ ref: 'e2', role: 'radio', name: 'All', checked: 'true' }),
    '[e2] radio "All" (checked)',
  )
  assert.equal(
    formatInteractiveLine({ ref: 'e3', role: 'searchbox', name: 'Search bills', disabled: true }),
    '[e3] searchbox "Search bills" (disabled)',
  )
})

test('collectInteractiveInPage stamps visible searchboxes and skips hidden or inert nodes', () => {
  function fakeNode(init) {
    const store = { ...(init.attrs || {}) }
    const node = {
      tagName: init.tagName,
      type: init.type,
      hidden: Boolean(init.hidden),
      labels: init.labels || [],
      placeholder: init.placeholder || '',
      innerText: init.innerText || '',
      textContent: init.textContent || '',
      disabled: init.disabled,
      checked: init.checked,
      ownerDocument: init.ownerDocument,
      getAttribute: (key) => store[key] ?? '',
      setAttribute: (key, value) => {
        store[key] = value
      },
      removeAttribute: (key) => {
        delete store[key]
      },
      hasAttribute: (key) => Object.hasOwn(store, key),
      getClientRects: () => init.rects ?? [{ width: 10, height: 10 }],
    }
    return node
  }

  const search = fakeNode({
    tagName: 'INPUT',
    type: 'search',
    attrs: { type: 'search' },
    labels: [{ innerText: 'Search bills', textContent: 'Search bills' }],
  })
  const hidden = fakeNode({
    tagName: 'BUTTON',
    attrs: { 'aria-hidden': 'true' },
    innerText: 'Hidden',
  })
  const option = fakeNode({
    tagName: 'DIV',
    attrs: { role: 'option' },
    innerText: 'Choice',
  })
  const bareLink = fakeNode({
    tagName: 'A',
    innerText: 'No href',
  })
  // Stale ref from an earlier snapshot; list mode must clear it before restamping.
  const stale = fakeNode({
    tagName: 'BUTTON',
    attrs: { 'data-verify-ref': 'e9' },
    innerText: 'Gone',
    rects: [],
  })
  const nodes = [search, hidden, option, bareLink, stale]
  const previous = globalThis.document
  globalThis.document = {
    querySelectorAll: (selector) => {
      if (selector === '[data-verify-ref]') {
        return nodes.filter((node) => node.hasAttribute('data-verify-ref'))
      }
      return nodes
    },
  }
  try {
    const arg = { roles: INTERACTIVE_ROLES, maxName: ACCESSIBLE_NAME_MAX, selector: 'input, button, a, [role]' }

    // Single mode (locator.evaluate shape) describes without touching refs.
    const fresh = collectInteractiveInPage(search, arg)
    assert.equal(fresh.role, 'searchbox')
    assert.equal(fresh.name, 'Search bills')
    assert.equal(fresh.tag, 'input')
    assert.equal(search.hasAttribute('data-verify-ref'), false)
    assert.equal(stale.getAttribute('data-verify-ref'), 'e9')

    const entries = collectInteractiveInPage(arg)
    assert.deepEqual(
      entries.map((entry) => ({ ref: entry.ref, role: entry.role, name: entry.name })),
      [
        { ref: 'e1', role: 'searchbox', name: 'Search bills' },
        { ref: 'e2', role: 'option', name: 'Choice' },
      ],
    )
    assert.equal(search.getAttribute('data-verify-ref'), 'e1')
    assert.equal(option.getAttribute('data-verify-ref'), 'e2')
    assert.equal(hidden.hasAttribute('data-verify-ref'), false)
    assert.equal(bareLink.hasAttribute('data-verify-ref'), false)
    assert.equal(stale.hasAttribute('data-verify-ref'), false)

    // Single mode after a snapshot reports the live ref and leaves it in place.
    const single = collectInteractiveInPage(search, arg)
    assert.equal(single.ref, 'e1')
    assert.equal(search.getAttribute('data-verify-ref'), 'e1')
    assert.equal(option.getAttribute('data-verify-ref'), 'e2')
  } finally {
    globalThis.document = previous
  }
})

test('getLocator rejects a stale --ref', async () => {
  const page = { locator: () => ({ count: async () => 0 }) }
  await assert.rejects(() => getLocator(page, { ref: 'e3' }), /ref e3 is stale or missing/)
})

test('parseArgs accepts --interactive and --mobile booleans', () => {
  const flags = parseArgs(['--interactive', '--mobile', '--width', '390', '--height', '844'])
  assert.equal(flags.interactive, true)
  assert.equal(flags.mobile, true)
  assert.equal(flags.width, '390')
  assert.equal(flags.height, '844')
})

test('parseViewportFlags writes a complete metrics object', () => {
  assert.deepEqual(parseViewportFlags({ width: '390', height: '844', mobile: true, 'device-scale-factor': '2' }), {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  assert.deepEqual(parseViewportFlags({ width: '1280', height: '800' }), {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  assert.throws(() => parseViewportFlags({ width: '0', height: '844' }), /--width/)
  assert.throws(() => parseViewportFlags({ width: '390' }), /--height/)
  assert.deepEqual(normalizeMetrics({}), { ...DEFAULT_METRICS })
  assert.deepEqual(normalizeMetrics({ width: 390, height: 844 }), {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  })
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

test('persistViewportFromCdp records dsf and mobile from CDP params', () => {
  assert.deepEqual(
    viewportFromCdpFlags({
      method: 'Emulation.setDeviceMetricsOverride',
      params: '{"width":390,"height":844,"deviceScaleFactor":2,"mobile":true}',
    }),
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  )
  assert.equal(viewportFromCdpFlags({ method: 'Runtime.evaluate', params: '{}' }), null)
})

test('browser commands reuse a persisted CDP viewport instead of resetting to 1280', () => {
  assert.deepEqual(deviceMetricsFromState({ viewport: { width: 390, height: 844 } }), {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  })
  assert.deepEqual(deviceMetricsFromState({ viewport: { width: 320, height: 568 } }), {
    width: 320,
    height: 568,
    deviceScaleFactor: 1,
    mobile: false,
  })
  assert.deepEqual(deviceMetricsFromState({}), { ...DEFAULT_METRICS })
  assert.deepEqual(
    deviceMetricsFromState({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } }),
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  )
})

test('applyViewport always sends a complete device-metrics override', async () => {
  const sent = []
  const page = {
    setViewportSize: async (size) => {
      sent.push(['setViewportSize', size])
    },
    context: () => ({
      newCDPSession: async () => ({
        send: async (method, params) => {
          sent.push([method, params])
        },
      }),
    }),
  }
  await applyViewport(page, { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  assert.deepEqual(sent[1], [
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  ])
  sent.length = 0
  const restored = await applyViewport(page, { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  assert.deepEqual(sent[0], ['setViewportSize', { width: 1280, height: 800 }])
  assert.deepEqual(sent[1], [
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  ])
  assert.equal(
    sent.some(([method]) => method === 'Emulation.clearDeviceMetricsOverride'),
    false,
  )
  assert.deepEqual(restored, { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
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

test('ensureWebDistPlaceholder copies web/index.html and does not clobber a real build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-web-dist-'))
  try {
    const source = '<!DOCTYPE html><html><head><meta property="og:title" content="Track Congress" /></head><body></body></html>\n'
    fs.mkdirSync(path.join(dir, 'web'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'web', 'index.html'), source, 'utf8')

    assert.equal(fs.existsSync(path.join(dir, 'web', 'dist')), false)
    assert.equal(ensureWebDistPlaceholder(dir), true)
    const indexPath = path.join(dir, 'web', 'dist', 'index.html')
    assert.equal(fs.readFileSync(indexPath, 'utf8'), source)
    assert.match(fs.readFileSync(indexPath, 'utf8'), /og:title/)

    const markerPath = path.join(dir, 'web', 'dist', 'marker.txt')
    fs.writeFileSync(markerPath, 'survives', 'utf8')
    assert.equal(ensureWebDistPlaceholder(dir), false)
    assert.equal(fs.readFileSync(markerPath, 'utf8'), 'survives')
    assert.equal(fs.readFileSync(indexPath, 'utf8'), source)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('ensureWebDistPlaceholder repairs an empty web/dist directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-web-dist-empty-'))
  try {
    const source = '<!DOCTYPE html><html><head><title>shell</title></head><body></body></html>\n'
    fs.mkdirSync(path.join(dir, 'web', 'dist'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'web', 'index.html'), source, 'utf8')
    assert.equal(ensureWebDistPlaceholder(dir), true)
    assert.equal(fs.readFileSync(path.join(dir, 'web', 'dist', 'index.html'), 'utf8'), source)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('ensureWebDistPlaceholder writes a minimal shell when web/index.html is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-web-dist-fallback-'))
  try {
    fs.mkdirSync(path.join(dir, 'web'), { recursive: true })
    assert.equal(ensureWebDistPlaceholder(dir), true)
    assert.equal(fs.readFileSync(path.join(dir, 'web', 'dist', 'index.html'), 'utf8'), FALLBACK_WEB_DIST_HTML)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('launch appends worker.log or web.log tails on any startup failure', () => {
  const source = fs.readFileSync(path.join(here, 'verify-congress-tracker.mjs'), 'utf8')
  assert.doesNotMatch(source, /startsWith\('worker not ready'\)/)
  assert.match(source, /errorWithLogTail\(err, path\.join\(RUN_DIR, 'worker\.log'\)\)/)
  assert.match(source, /errorWithLogTail\(err, path\.join\(RUN_DIR, 'web\.log'\)\)/)
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
