import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const setupScript = path.join(rootDir, 'scripts', 'setup-workers-builds.sh')

test('setup-workers-builds.sh documents congress-tracker build settings', () => {
  const script = fs.readFileSync(setupScript, 'utf8')
  assert.match(script, /congress-tracker-api/)
  assert.match(script, /0398358f0f8a4130b5e60eaff2846902/)
  assert.match(script, /GITHUB_REPO_NAME="congress-tracker"/)
  assert.match(script, /npm run build:web/)
  assert.match(script, /wrangler deploy --config workers\/senate_data_worker\/wrangler\.toml/)
})

test('setup-workers-builds.sh --dry-run prints API steps without network', () => {
  const { stdout, stderr } = spawnSync('bash', [setupScript, '--dry-run'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
      CLOUDFLARE_BUILDS_API_TOKEN: 'test-user-token',
    },
  })
  const combined = `${stdout}\n${stderr}`
  assert.match(combined, /\[dry-run\] GET \/builds\/tokens/)
  assert.match(combined, /\[dry-run\] PUT \/builds\/repos\/connections/)
  assert.match(combined, /\[dry-run\] POST \/builds\/triggers/)
})
