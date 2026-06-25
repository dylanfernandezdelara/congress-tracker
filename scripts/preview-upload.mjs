import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workerDir = path.join(repoRoot, 'workers', 'senate_data_worker')

function sanitizePreviewAlias(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)
}

function resolvePreviewAlias() {
  if (process.env.PREVIEW_ALIAS) {
    return sanitizePreviewAlias(process.env.PREVIEW_ALIAS)
  }

  const branch = execSync('git branch --show-current', {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()

  if (!branch || branch === 'main') return null
  return sanitizePreviewAlias(branch)
}

const alias = resolvePreviewAlias()
const args = ['versions', 'upload', '--config', 'wrangler.toml']
if (alias) {
  args.push('--preview-alias', alias)
  console.log(`Preview alias: ${alias}`)
  console.log(`Stable preview URL pattern: https://${alias}-congress-tracker-api.<subdomain>.workers.dev`)
}

execFileSync('wrangler', args, { cwd: workerDir, stdio: 'inherit' })
