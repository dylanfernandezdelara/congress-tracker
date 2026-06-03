/**
 * Generic HTTP transport for source adapters: retry, exponential backoff with
 * jitter, Retry-After handling, and request timeouts. The harness fixture
 * transport is injected via `FetchConfig.fixture` (built from `Runtime`), so
 * this module never reads global state and defaults to the real network.
 */
import { DISABLED_FIXTURE_HTTP, type FixtureHttp } from "../harness";

export interface FetchConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** Maximum concurrent requests (default: 4) */
  concurrency?: number;
  /** Maximum backoff delay in ms (default: 30000) */
  maxDelayMs?: number;
  /**
   * Harness fixture transport. When enabled, recorded responses are returned
   * instead of hitting the network. Defaults to disabled (real fetch).
   */
  fixture?: FixtureHttp;
}

export interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface BatchFetchResult<T> {
  results: Map<number, FetchResult<T>>;
  successCount: number;
  failureCount: number;
}

const DEFAULT_CONFIG: Omit<Required<FetchConfig>, "fixture"> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 10000,
  concurrency: 4,
  maxDelayMs: 30000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  retryAfterMs: number | null = null
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const budgeted = retryAfterMs === null ? exponential : Math.min(maxDelayMs, Math.max(exponential, retryAfterMs));
  const jitterFloor = Math.max(0, budgeted * 0.85);
  const jitterCeil = Math.max(jitterFloor, budgeted * 1.15);
  return Math.round(jitterFloor + Math.random() * (jitterCeil - jitterFloor));
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fixture: FixtureHttp,
  init?: RequestInit
): Promise<Response> {
  if (fixture.enabled) {
    const fixtureResponse = fixture.resolve(url);
    if (fixtureResponse) {
      return new Response(fixtureResponse.body, {
        status: fixtureResponse.status,
        headers: {
          "Content-Type": fixtureResponse.contentType,
        },
      });
    }
    return new Response(`Missing harness fixture for ${url}`, {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      ...init,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch XML content with automatic retry and exponential backoff.
 */
export async function fetchXmlWithRetry(
  url: string,
  config: FetchConfig = {}
): Promise<FetchResult<string>> {
  const { maxRetries, baseDelayMs, timeoutMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const { maxDelayMs } = { ...DEFAULT_CONFIG, ...config };
  const fixture = config.fixture ?? DISABLED_FIXTURE_HTTP;

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs, fixture, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SenateDataWorker/1.0)",
          Accept: "application/xml, text/xml, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      });
      lastStatusCode = response.status;

      if (response.ok) {
        const text = await response.text();
        return { success: true, data: text, statusCode: response.status };
      }

      // Don't retry client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));

      if (attempt < maxRetries) {
        await sleep(computeDelay(attempt, baseDelayMs, maxDelayMs, retryAfterMs));
      }
      continue;
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          lastError = `Request timeout after ${timeoutMs}ms`;
        } else {
          lastError = err.message;
        }
      } else {
        lastError = String(err);
      }
    }

    if (attempt < maxRetries) {
      await sleep(computeDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }

  return {
    success: false,
    error: lastError ?? "Unknown error",
    statusCode: lastStatusCode,
  };
}

/**
 * Fetch JSON content with retry and exponential backoff.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  config: FetchConfig = {},
  headers: HeadersInit = {}
): Promise<FetchResult<T>> {
  const { maxRetries, baseDelayMs, timeoutMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const { maxDelayMs } = { ...DEFAULT_CONFIG, ...config };
  const fixture = config.fixture ?? DISABLED_FIXTURE_HTTP;

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs, fixture, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SenateDataWorker/1.0)",
          Accept: "application/json, */*",
          ...headers,
        },
      });
      lastStatusCode = response.status;

      if (response.ok) {
        const json = (await response.json()) as T;
        return { success: true, data: json, statusCode: response.status };
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      if (attempt < maxRetries) {
        await sleep(computeDelay(attempt, baseDelayMs, maxDelayMs, retryAfterMs));
      }
      continue;
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          lastError = `Request timeout after ${timeoutMs}ms`;
        } else {
          lastError = err.message;
        }
      } else {
        lastError = String(err);
      }
    }

    if (attempt < maxRetries) {
      await sleep(computeDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }

  return {
    success: false,
    error: lastError ?? "Unknown error",
    statusCode: lastStatusCode,
  };
}
