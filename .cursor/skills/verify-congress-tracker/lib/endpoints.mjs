import path from 'node:path'

export const DEFAULT_WEB_PORT = 5174
export const DEFAULT_WORKER_PORT = 8788
export const DEFAULT_CDP_PORT = 9223
export const VERIFY_VITE_MODE = 'verify-congress-tracker'

export function parsePort(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`invalid ${name}: ${raw}`)
  }
  return n
}

export function resolveEndpoints(env = process.env) {
  const webPort = parsePort(env.VERIFY_WEB_PORT, DEFAULT_WEB_PORT, 'VERIFY_WEB_PORT')
  const workerPort = parsePort(env.VERIFY_WORKER_PORT, DEFAULT_WORKER_PORT, 'VERIFY_WORKER_PORT')
  const cdpPort = parsePort(env.VERIFY_CDP_PORT, DEFAULT_CDP_PORT, 'VERIFY_CDP_PORT')
  return {
    webPort,
    workerPort,
    cdpPort,
    webUrl: `http://127.0.0.1:${webPort}`,
    workerUrl: `http://127.0.0.1:${workerPort}`,
  }
}

export function endpointsFromState(state, env = process.env) {
  if (state === null || state === undefined) {
    return resolveEndpoints(env)
  }
  const required = ['webUrl', 'workerUrl', 'webPort', 'workerPort', 'cdpPort']
  if (required.some((key) => state[key] == null || state[key] === '')) {
    throw new Error('state.json is missing endpoint fields; run cleanup then launch')
  }
  return {
    webPort: parsePort(state.webPort, undefined, 'webPort'),
    workerPort: parsePort(state.workerPort, undefined, 'workerPort'),
    cdpPort: parsePort(state.cdpPort, undefined, 'cdpPort'),
    webUrl: state.webUrl,
    workerUrl: state.workerUrl,
  }
}

export function viteEnvFor(endpoints) {
  return {
    VITE_DEV_PORT: String(endpoints.webPort),
    VITE_WORKER_ORIGIN: endpoints.workerUrl,
  }
}

export function workerArgsFor(endpoints, persistTo) {
  return [
    '--prefix',
    'workers/senate_data_worker',
    'run',
    'dev',
    '--',
    '--local',
    '--persist-to',
    persistTo,
    '--ip',
    '127.0.0.1',
    '--port',
    String(endpoints.workerPort),
    '--show-interactive-dev-session',
    'false',
  ]
}

export function seedEnvFor(persistTo) {
  return { SEED_PERSIST_TO: persistTo }
}

export function webDevArgs() {
  return ['run', 'dev:web', '--', '--mode', VERIFY_VITE_MODE]
}

export function isAllowedAppUrl(urlString, webUrl) {
  if (typeof urlString !== 'string' || urlString.length === 0) return false
  if (typeof webUrl !== 'string' || webUrl.length === 0) return false

  let absolute
  try {
    if (urlString.startsWith('/')) {
      absolute = new URL(urlString, webUrl)
    } else {
      absolute = new URL(urlString)
    }
  } catch {
    return false
  }

  let expectedOrigin
  try {
    expectedOrigin = new URL(webUrl).origin
  } catch {
    return false
  }
  if (absolute.origin !== expectedOrigin) return false

  let decoded
  try {
    decoded = decodeURIComponent(absolute.pathname)
  } catch {
    return false
  }
  const normalized = path.posix.normalize(decoded)
  if (normalized.startsWith('/@')) return false
  if (normalized.includes('/node_modules/')) return false
  if (normalized.split('/').some((segment) => segment.startsWith('.'))) return false
  return true
}
