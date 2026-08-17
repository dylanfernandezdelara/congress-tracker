import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(rootDir, 'scripts', 'configure-workers-builds-production-deploy.sh')

test('configure-workers-builds script documents production wrangler deploy', () => {
  const content = fs.readFileSync(scriptPath, 'utf8')
  assert.match(content, /PRODUCTION_DEPLOY_COMMAND='npm --prefix workers\/senate_data_worker run deploy'/)
  assert.match(content, /PREVIEW_DEPLOY_COMMAND='npm --prefix workers\/senate_data_worker run preview:upload'/)
  assert.match(content, /npm --prefix workers\/senate_data_worker ci/)
  assert.match(content, /npm run build:web/)
  assert.match(content, /Keep Workers Builds connected to GitHub/)
  assert.match(content, /docs\/ORIGIN\.md/)
})
