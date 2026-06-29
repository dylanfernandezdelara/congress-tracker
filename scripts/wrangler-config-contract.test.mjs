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

  const previewUrlsMatch = content.match(/^preview_urls\s*=\s*(true|false)/m)
  const cronMatch = content.match(/crons\s*=\s*\["([^"]+)"\]/)
  const congressMatch = content.match(/^CONGRESS\s*=\s*"([^"]+)"/m)
  const sessionMatch = content.match(/^SESSION\s*=\s*"([^"]+)"/m)
  const assetsMatch = content.match(/\[assets\][\s\S]*?^directory\s*=\s*"([^"]+)"/m)

  const d1Match = content.match(
    /\[\[d1_databases\]\][\s\S]*?^binding\s*=\s*"([^"]+)"[\s\S]*?^database_name\s*=\s*"([^"]+)"[\s\S]*?^database_id\s*=\s*"([^"]+)"[\s\S]*?^preview_database_id\s*=\s*"([^"]+)"/m,
  )

  return {
    name: getTopLevelString('name'),
    main: getTopLevelString('main'),
    compatibility_date: getTopLevelString('compatibility_date'),
    preview_urls: previewUrlsMatch?.[1] === 'true',
    cron: cronMatch?.[1],
    congress: congressMatch?.[1],
    session: sessionMatch?.[1],
    assetsDirectory: assetsMatch?.[1],
    d1Binding: d1Match?.[1],
    d1DatabaseName: d1Match?.[2],
    d1DatabaseId: d1Match?.[3],
    d1PreviewDatabaseId: d1Match?.[4],
  }
}

test('root and worker wrangler.toml share deployment metadata', () => {
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)

  assert.equal(root.name, worker.name)
  assert.equal(root.compatibility_date, worker.compatibility_date)
  assert.equal(root.preview_urls, worker.preview_urls)
  assert.equal(root.cron, worker.cron)
  assert.equal(root.congress, worker.congress)
  assert.equal(root.session, worker.session)
  assert.equal(root.d1Binding, worker.d1Binding)
  assert.equal(root.d1DatabaseName, worker.d1DatabaseName)
  assert.equal(root.d1DatabaseId, worker.d1DatabaseId)
  assert.equal(root.d1PreviewDatabaseId, worker.d1PreviewDatabaseId);
})

test('preview D1 database is isolated from production', () => {
  const root = parseWranglerConfig(rootConfigPath)
  assert.notEqual(root.d1DatabaseId, root.d1PreviewDatabaseId)
})

test('wrangler.toml entrypoints differ by design between root and worker configs', () => {
  const root = parseWranglerConfig(rootConfigPath)
  const worker = parseWranglerConfig(workerConfigPath)

  assert.equal(root.main, 'workers/senate_data_worker/src/worker.ts')
  assert.equal(worker.main, 'src/worker.ts')
  assert.equal(root.assetsDirectory, 'web/dist')
  assert.equal(worker.assetsDirectory, '../../web/dist')
})
