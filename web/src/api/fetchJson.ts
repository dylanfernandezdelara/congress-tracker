import { getApiBaseUrl } from './config'

export class ApiError extends Error {
  readonly status: number
  readonly statusText: string
  /** Machine-readable `error` code from a JSON error body, when the API sent one. */
  readonly code: string | null

  constructor(message: string, status: number, statusText: string, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.code = code
  }
}

const NETWORK_ERROR_MESSAGE =
  'Failed to connect to the API. Please check your internet connection and try again.'
const INVALID_JSON_MESSAGE = 'The API returned invalid data. Please try again later.'

function getErrorMessage(status: number): string {
  switch (status) {
    case 404:
      return 'No data found. Data may not be available yet.'
    case 403:
      return 'Access to voting data is forbidden. Please check your API configuration.'
    case 429:
      return 'Too many requests. Please wait a moment and try again.'
    case 500:
      return 'The server encountered an error. Please try again later.'
    case 502:
    case 503:
    case 504:
      return 'The server is temporarily unavailable. Please try again later.'
    default:
      return `Failed to fetch voting data (HTTP ${status}). Please try again.`
  }
}

export function buildApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${getApiBaseUrl()}${normalized}`
}

export async function fetchJson<T>(path: string): Promise<T> {
  const url = buildApiUrl(path)

  let response: Response
  try {
    response = await fetch(url, import.meta.env.DEV ? { cache: 'no-store' } : undefined)
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE)
  }

  if (!response.ok) {
    throw new ApiError(getErrorMessage(response.status), response.status, response.statusText)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new Error(INVALID_JSON_MESSAGE)
  }
}

async function readErrorBody(response: Response): Promise<{ code: string | null; message: string | null }> {
  try {
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object') return { code: null, message: null }
    const record = body as Record<string, unknown>
    return {
      code: typeof record.error === 'string' ? record.error : null,
      message: typeof record.message === 'string' ? record.message : null,
    }
  } catch {
    return { code: null, message: null }
  }
}

/**
 * JSON POST. Unlike `fetchJson`, error responses surface the API's own
 * `message` (these endpoints return reader-facing validation copy).
 */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = buildApiUrl(path)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const { code, message } = await readErrorBody(response)
    throw new ApiError(
      message ?? getErrorMessage(response.status),
      response.status,
      response.statusText,
      code,
    )
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new Error(INVALID_JSON_MESSAGE)
  }
}
