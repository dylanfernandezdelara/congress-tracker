import { USER_AGENT } from "../constants";

/**
 * Drop query strings (which may carry an `api_key`) before a URL is surfaced in
 * an error message or log line. Some upstreams (Congress.gov) take the key as a
 * query param, so the raw URL must never be echoed back to clients.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0];
  }
}

export class HttpResponseError extends Error {
  readonly status: number;
  readonly rateLimitRemaining: number | null;

  constructor(status: number, url: string, rateLimitRemaining: number | null) {
    super(`HTTP ${status} for ${redactUrl(url)}`);
    this.name = "HttpResponseError";
    this.status = status;
    this.rateLimitRemaining = rateLimitRemaining;
  }
}

function parseRateLimitRemaining(res: Response): number | null {
  const raw = res.headers.get("X-Ratelimit-Remaining") ?? res.headers.get("x-ratelimit-remaining");
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new HttpResponseError(res.status, url, parseRateLimitRemaining(res));
  }
  return res.text();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init);
  return JSON.parse(text) as T;
}

/** Fetch JSON and return remaining rate-limit budget when the upstream exposes it. */
export async function fetchJsonWithMeta<T>(
  url: string,
  init?: RequestInit
): Promise<{ data: T; rateLimitRemaining: number | null }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      ...(init?.headers ?? {}),
    },
  });
  const rateLimitRemaining = parseRateLimitRemaining(res);
  if (!res.ok) {
    throw new HttpResponseError(res.status, url, rateLimitRemaining);
  }
  const data = (await res.json()) as T;
  return { data, rateLimitRemaining };
}

/** Attach `api_key` to a Congress.gov URL when the upstream pagination link omits it. */
export function appendApiKey(url: string, apiKey: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("api_key")) {
    parsed.searchParams.set("api_key", apiKey);
  }
  return parsed.toString();
}

/** Resolve Congress.gov `pagination.next` (or null) with an API key attached. */
export function nextPageUrl(raw: string | undefined | null, apiKey: string): string | null {
  if (!raw) return null;
  return appendApiKey(raw, apiKey);
}
