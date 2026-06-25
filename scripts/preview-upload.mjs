import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const WORKER_NAME = 'congress-tracker-api'
export const MAX_PREVIEW_ALIAS_LEN = 63 - 1 - WORKER_NAME.length

const PREVIEW_ALIAS_RE = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function sanitizePreviewAlias(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_PREVIEW_ALIAS_LEN)
}

export function isValidPreviewAlias(alias) {
  if (!alias) return false
  if (alias.length > MAX_PREVIEW_ALIAS_LEN) return false
  return PREVIEW_ALIAS_RE.test(alias)
}

export function resolvePreviewAlias(branch, envAlias = process.env.PREVIEW_ALIAS) {
  if (envAlias) {
    return sanitizePreviewAlias(envAlias)
  }
  if (!branch || branch === 'main') return ''
  return sanitizePreviewAlias(branch)
}

function runPreviewUpload() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const workerDir = path.join(repoRoot, 'workers', 'senate_data_worker')

  const branch = execSync('git branch --show-current', {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()

  const alias = resolvePreviewAlias(branch)
  const args = ['versions', 'upload', '--config', 'wrangler.toml']

  if (alias && isValidPreviewAlias(alias)) {
    args.push('--preview-alias', alias)
    console.log(`Preview alias: ${alias}`)
    console.log(
      `Stable preview URL pattern: https://${alias}-${WORKER_NAME}.<subdomain>.workers.dev`,
    )
  } else if (branch && branch !== 'main') {
    console.warn(
      `Skipping preview alias for branch "${branch}" (sanitized: "${alias || ''}") — uploading version-only preview URL.`,
    )
  }

  execFileSync('wrangler', args, { cwd: workerDir, stdio: 'inherit' })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPreviewUpload()
}
