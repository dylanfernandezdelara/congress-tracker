import { execFileSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const WORKER_NAME = 'congress-tracker-api'
/** Preview uploads target the `[env.preview]` Worker name (`${WORKER_NAME}-preview`). */
export const PREVIEW_WORKER_NAME = `${WORKER_NAME}-preview`
export const MAX_PREVIEW_ALIAS_LEN = 63 - 1 - PREVIEW_WORKER_NAME.length

const PREVIEW_ALIAS_RE = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function sanitizePreviewAlias(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_PREVIEW_ALIAS_LEN)
    .replace(/-+$/g, '')
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
  const args = ['versions', 'upload', '--config', 'wrangler.toml', '--env', 'preview']

  if (alias && isValidPreviewAlias(alias)) {
    args.push('--preview-alias', alias)
    console.log(`Preview alias: ${alias}`)
    console.log(
      `Stable preview URL pattern: https://${alias}-${PREVIEW_WORKER_NAME}.<subdomain>.workers.dev`,
    )
  } else if (branch && branch !== 'main') {
    console.warn(
      `Skipping preview alias for branch "${branch}" (sanitized: "${alias || ''}") — uploading version-only preview URL.`,
    )
  }

  execFileSync(process.execPath, [wranglerEntry(workerDir), ...args], {
    cwd: workerDir,
    stdio: 'inherit',
  })
}

function wranglerEntry(workerDir) {
  const local = path.join(workerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  if (existsSync(local)) return local
  throw new Error(
    'wrangler not found — run npm --prefix workers/senate_data_worker ci before npm run preview',
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPreviewUpload()
}
