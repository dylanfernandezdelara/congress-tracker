/**
 * API configuration helpers.
 *
 * Provides utilities for resolving the API base URL with a well-defined
 * priority order, supporting local development and environment configuration.
 */

/**
 * Resolves the API base URL using the following priority order:
 *
 * 1. `import.meta.env.VITE_API_URL` - Explicit override (set in .env or build)
 * 2. Same-origin (empty string -> relative requests). In production the Worker
 *    serves both the app and the API. In local dev, Vite proxies `/feed`,
 *    `/stats`, `/health`, and `/debug` to the worker on :8787
 *    (see `web/vite.config.ts`).
 *
 * The returned URL will NOT have a trailing slash.
 *
 * @returns The resolved API base URL
 *
 * @example
 * ```ts
 * const baseUrl = getApiBaseUrl();
 * const response = await fetch(`${baseUrl}/briefings/latest.json`);
 * ```
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return normalizeUrl(envUrl);
  }

  return '';
}

/**
 * Normalizes a URL by removing trailing slashes.
 *
 * @param url - The URL to normalize
 * @returns The normalized URL without trailing slashes
 */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
