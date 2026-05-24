import type { FetchConfig } from "./fetch";
import { readSourceFetchLog, recordSourceFetchLog } from "./d1/source-log";
import { isHarnessFixtureMode, resolveHarnessFixtureResponse } from "./harness";
import {
  buildSourceArtifactKey,
  readTextFromR2,
  writeTextToR2IfMissing,
} from "./storage";

export interface SourceCacheEnv {
  DATA_BUCKET: R2Bucket;
  SENATE_DB?: D1Database;
  GOVINFO_API_KEY?: string;
}

export interface SourceArtifactRequest {
  source: string;
  entityKey: string;
  requestUrl: string;
  fetchedAt?: string;
  extension?: "txt" | "html" | "json" | "xml";
  headers?: HeadersInit;
  metadata?: Record<string, unknown>;
}

export interface SourceArtifactFetchResult {
  cached: boolean;
  artifactKey?: string;
  text?: string;
  statusCode?: number;
  contentType?: string;
  error?: string;
}

const DEFAULT_CONFIG: Required<FetchConfig> = {
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
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
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

/** Strip credential query params before persisting URLs in D1 or cache keys. */
export function sanitizeRequestUrlForStorage(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("api_key");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.replace(/([?&])api_key=[^&]*/gi, "$1").replace(/[?&]$/, "");
  }
}

function buildCacheKey(source: string, entityKey: string, requestUrl: string): string {
  const normalizedUrl = sanitizeRequestUrlForStorage(requestUrl);
  return `${source.trim().toLowerCase()}|${entityKey.trim().toLowerCase()}|${normalizedUrl}`;
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: HeadersInit
): Promise<Response> {
  const fixtureResponse = resolveHarnessFixtureResponse(url);
  if (fixtureResponse) {
    return new Response(fixtureResponse.body, {
      status: fixtureResponse.status,
      headers: {
        "Content-Type": fixtureResponse.contentType,
      },
    });
  }
  if (isHarnessFixtureMode()) {
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
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SenateDataWorker/1.0)",
        Accept: "text/plain, text/html, application/json, application/xml, */*",
        ...(headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTextWithRetry(
  url: string,
  config: FetchConfig,
  headers?: HeadersInit
): Promise<SourceArtifactFetchResult> {
  const { maxRetries, baseDelayMs, timeoutMs, maxDelayMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;
  let lastContentType: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchTextWithTimeout(url, timeoutMs, headers);
      lastStatusCode = response.status;
      lastContentType = response.headers.get("content-type") ?? undefined;

      if (response.ok) {
        return {
          cached: false,
          text: await response.text(),
          statusCode: response.status,
          contentType: lastContentType,
        };
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          cached: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          contentType: lastContentType,
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      if (attempt < maxRetries) {
        await sleep(computeDelay(attempt, baseDelayMs, maxDelayMs, retryAfterMs));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = `Request timeout after ${timeoutMs}ms`;
      } else {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt < maxRetries) {
        await sleep(computeDelay(attempt, baseDelayMs, maxDelayMs));
      }
    }
  }

  return {
    cached: false,
    statusCode: lastStatusCode,
    contentType: lastContentType,
    error: lastError ?? "Unknown source fetch error",
  };
}

function inferExtension(
  explicit: SourceArtifactRequest["extension"],
  requestUrl: string,
  contentType?: string
): "txt" | "html" | "json" | "xml" {
  if (explicit) return explicit;
  const normalizedType = (contentType ?? "").toLowerCase();
  if (normalizedType.includes("html")) return "html";
  if (normalizedType.includes("json")) return "json";
  if (normalizedType.includes("xml")) return "xml";
  if (requestUrl.toLowerCase().endsWith(".html")) return "html";
  if (requestUrl.toLowerCase().endsWith(".json")) return "json";
  if (requestUrl.toLowerCase().endsWith(".xml")) return "xml";
  return "txt";
}

export async function fetchSourceArtifactText(
  env: SourceCacheEnv,
  request: SourceArtifactRequest,
  config: FetchConfig = {}
): Promise<SourceArtifactFetchResult> {
  const cacheKey = buildCacheKey(request.source, request.entityKey, request.requestUrl);
  if (env.SENATE_DB) {
    const cachedMetadata = await readSourceFetchLog(env.SENATE_DB, cacheKey);
    if (cachedMetadata?.artifactKey) {
      const cachedText = await readTextFromR2(env.DATA_BUCKET, cachedMetadata.artifactKey);
      if (cachedText) {
        return {
          cached: true,
          artifactKey: cachedMetadata.artifactKey,
          text: cachedText,
          statusCode: cachedMetadata.statusCode,
          contentType: cachedMetadata.contentType,
        };
      }
    }
  }

  const fetchedAt = request.fetchedAt ?? new Date().toISOString();
  const networkResult = await fetchTextWithRetry(request.requestUrl, config, request.headers);

  if (networkResult.text) {
    const extension = inferExtension(request.extension, request.requestUrl, networkResult.contentType);
    const artifactKey = buildSourceArtifactKey(request.source, request.entityKey, fetchedAt, extension);
    await writeTextToR2IfMissing(env.DATA_BUCKET, artifactKey, networkResult.text, {
      contentType: networkResult.contentType,
    });

    if (env.SENATE_DB) {
      await recordSourceFetchLog(env.SENATE_DB, {
        cacheKey,
        source: request.source,
        entityKey: request.entityKey,
        requestUrl: sanitizeRequestUrlForStorage(request.requestUrl),
        statusCode: networkResult.statusCode,
        contentType: networkResult.contentType,
        artifactKey,
        fetchedAt,
        metadata: request.metadata,
      });
    }

    return {
      ...networkResult,
      artifactKey,
    };
  }

  if (env.SENATE_DB) {
    await recordSourceFetchLog(env.SENATE_DB, {
      cacheKey,
      source: request.source,
      entityKey: request.entityKey,
      requestUrl: sanitizeRequestUrlForStorage(request.requestUrl),
      statusCode: networkResult.statusCode,
      contentType: networkResult.contentType,
      fetchedAt,
      errorMessage: networkResult.error,
      metadata: request.metadata,
    });
  }

  return networkResult;
}
