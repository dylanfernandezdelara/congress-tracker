import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootConfigPath = path.join(rootDir, 'wrangler.toml')
const workerConfigPath = path.join(rootDir, 'workers', 'senate_data_worker', 'wrangler.toml')

function parseWranglerConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')

  const getTopLevelString = (key) => {
    const match = content.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))
    return match?.[1]
  }

  const workersDevMatch = content.match(/^workers_dev\s*=\s*(true|false)/m)
  const previewUrlsMatch = content.match(/^preview_urls\s*=\s*(true|false)/m)
  const browserBindingMatch = content.match(
    /^\[browser\]\s*\nbinding\s*=\s*"([^"]+)"/m,
  )
  const previewBrowserBindingMatch = content.match(
    /^\[env\.preview\.browser\]\s*\nbinding\s*=\s*"([^"]+)"/m,
  )
  // Anchored so a commented-out `# crons = [...]` above the live array cannot win.
  const cronMatch = content.match(/^crons\s*=\s*\[([^\]]+)\]/m)
  const crons = cronMatch
    ? [...cronMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    : []
  const congressMatch = content.match(/^CONGRESS\s*=\s*"([^"]+)"/m)
  const sessionMatch = content.match(/^SESSION\s*=\s*"([^"]+)"/m)
  const assetsMatch = content.match(/\[assets\][\s\S]*?^directory\s*=\s*"([^"]+)"/m)

  const observabilitySection = content.match(
    /\[observability\]\s*\nenabled\s*=\s*(true|false)\s*\nhead_sampling_rate\s*=\s*([0-9.]+)/,
  )

  const d1Match = content.match(
    /\[\[d1_databases\]\][\s\S]*?^binding\s*=\s*"([^"]+)"[\s\S]*?^database_name\s*=\s*"([^"]+)"[\s\S]*?^database_id\s*=\s*"([^"]+)"[\s\S]*?^preview_database_id\s*=\s*"([^"]+)"/m,
  )
  const previewEnvD1Match = content.match(
    /\[\[env\.preview\.d1_databases\]\][\s\S]*?^binding\s*=\s*"([^"]+)"[\s\S]*?^database_name\s*=\s*"([^"]+)"[\s\S]*?^database_id\s*=\s*"([^"]+)"/m,
  )

  return {
    name: getTopLevelString('name'),
    main: getTopLevelString('main'),
    compatibility_date: getTopLevelString('compatibility_date'),
    workers_dev: workersDevMatch?.[1] === 'true',
    preview_urls: previewUrlsMatch?.[1] === 'true',
    browserBinding: browserBindingMatch?.[1],
    previewBrowserBinding: previewBrowserBindingMatch?.[1],
    crons,
    congress: congressMatch?.[1],
    session: sessionMatch?.[1],
    assetsDirectory: assetsMatch?.[1],
    observabilityEnabled: observabilitySection?.[1] === 'true',
    observabilityHeadSamplingRate: observabilitySection
      ? Number(observabilitySection[2])
      : undefined,
    d1Binding: d1Match?.[1],
    d1DatabaseName: d1Match?.[2],
    d1DatabaseId: d1Match?.[3],
    d1PreviewDatabaseId: d1Match?.[4],
    previewEnvD1Binding: previewEnvD1Match?.[1],
    previewEnvD1DatabaseName: previewEnvD1Match?.[2],
    previewEnvD1DatabaseId: previewEnvD1Match?.[3],
  }
}

test('compatibility_date meets Browser Run quickAction floor', () => {
  // quickAction() requires compatibility_date >= 2026-03-24.
  const minDate = '2026-03-24'
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)
  assert.ok(root.compatibility_date, 'root compatibility_date missing')
  assert.ok(worker.compatibility_date, 'worker compatibility_date missing')
  assert.ok(
    root.compatibility_date >= minDate,
    `root compatibility_date ${root.compatibility_date} must be >= ${minDate}`,
  )
  assert.ok(
    worker.compatibility_date >= minDate,
    `worker compatibility_date ${worker.compatibility_date} must be >= ${minDate}`,
  )
})

test('root and worker wrangler.toml share deployment metadata', () => {
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)

  assert.equal(root.name, worker.name)
  assert.equal(root.compatibility_date, worker.compatibility_date)
  assert.equal(root.preview_urls, worker.preview_urls)
  assert.equal(root.browserBinding, worker.browserBinding)
  assert.equal(root.previewBrowserBinding, worker.previewBrowserBinding)
  assert.deepEqual(root.crons, worker.crons)
  assert.equal(root.congress, worker.congress)
  assert.equal(root.session, worker.session)
  assert.equal(root.d1Binding, worker.d1Binding)
  assert.equal(root.d1DatabaseName, worker.d1DatabaseName)
  assert.equal(root.d1DatabaseId, worker.d1DatabaseId)
  assert.equal(root.d1PreviewDatabaseId, worker.d1PreviewDatabaseId)
  assert.equal(root.previewEnvD1Binding, worker.previewEnvD1Binding)
  assert.equal(root.previewEnvD1DatabaseId, worker.previewEnvD1DatabaseId)
  assert.equal(root.observabilityEnabled, worker.observabilityEnabled)
  assert.equal(root.observabilityHeadSamplingRate, worker.observabilityHeadSamplingRate)
})

test('cron triggers keep daily feed and hourly executive on distinct minutes', () => {
  // Schedule strings are locked to TypeScript constants in
  // workers/senate_data_worker/src/wrangler-cron-contract.test.ts.
  // Here we only assert the lease-safety invariant: both pipelines share one
  // D1 write lease, so crons must not fire on the same minute.
  const root = parseWranglerConfig(rootConfigPath)
  assert.equal(root.crons.length, 2, 'expected exactly two cron triggers')
  const minutes = root.crons.map((cron) => {
    const minuteField = cron.split(' ')[0]
    assert.match(minuteField, /^\d+$/, `cron minute must be numeric: ${cron}`)
    return Number(minuteField)
  })
  assert.equal(
    new Set(minutes).size,
    minutes.length,
    'cron triggers must fire on distinct minutes to avoid D1 write-lease races',
  )
})

test('Workers Logs observability is enabled at full sampling on both configs', () => {
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)

  assert.equal(root.observabilityEnabled, true)
  assert.equal(root.observabilityHeadSamplingRate, 1)
  assert.equal(worker.observabilityEnabled, true)
  assert.equal(worker.observabilityHeadSamplingRate, 1)
})

test('browser binding is set on top-level and preview (not inherited by named envs)', () => {
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)
  assert.equal(root.browserBinding, 'BROWSER')
  assert.equal(worker.browserBinding, 'BROWSER')
  assert.equal(root.previewBrowserBinding, 'BROWSER')
  assert.equal(worker.previewBrowserBinding, 'BROWSER')
})

test('workers_dev and preview_urls stay top-level (not swallowed by [browser] TOML table)', () => {
  // In TOML, keys after a [table] header belong to that table. Putting
  // workers_dev/preview_urls after [browser] makes Wrangler warn and ignore them.
  for (const filePath of [rootConfigPath, workerConfigPath]) {
    const content = fs.readFileSync(filePath, 'utf8')
    const browserIdx = content.search(/^\[browser\]/m)
    const workersDevIdx = content.search(/^workers_dev\s*=/m)
    const previewUrlsIdx = content.search(/^preview_urls\s*=/m)
    assert.ok(browserIdx >= 0, `${filePath} missing [browser]`)
    assert.ok(workersDevIdx >= 0, `${filePath} missing workers_dev`)
    assert.ok(previewUrlsIdx >= 0, `${filePath} missing preview_urls`)
    assert.ok(
      workersDevIdx < browserIdx,
      `${filePath}: workers_dev must appear before [browser]`,
    )
    assert.ok(
      previewUrlsIdx < browserIdx,
      `${filePath}: preview_urls must appear before [browser]`,
    )
  }
})

test('workers_dev stays explicitly enabled so ops can reach /health without Bot Fight', () => {
  // Custom-domain [[routes]] make Wrangler infer workers_dev=false unless set.
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)
  assert.equal(root.workers_dev, true)
  assert.equal(worker.workers_dev, true)
})

test('preview D1 database is isolated from production', () => {
  const root = parseWranglerConfig(rootConfigPath)
  assert.notEqual(root.d1DatabaseId, root.d1PreviewDatabaseId)
  assert.notEqual(root.d1DatabaseId, root.previewEnvD1DatabaseId)
  assert.equal(root.previewEnvD1DatabaseId, root.d1PreviewDatabaseId)
})

test('wrangler.toml entrypoints differ by design between root and worker configs', () => {
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)

  assert.equal(root.main, 'workers/senate_data_worker/src/worker.ts')
  assert.equal(worker.main, 'src/worker.ts')
  assert.equal(root.assetsDirectory, 'web/dist')
  assert.equal(worker.assetsDirectory, '../../web/dist')
})
