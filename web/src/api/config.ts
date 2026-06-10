/**
 * API configuration helpers.
 *
 * Provides utilities for resolving the API base URL with a well-defined
 * priority order, supporting local development and environment configuration.
 */

/** Default fallback API URL for local development */
const DEFAULT_API_URL = 'http://localhost:8787';

/**
 * Resolves the API base URL using the following priority order:
 *
 * 1. `import.meta.env.VITE_API_URL` - Explicit override (set in .env or build)
 * 2. Production builds - same-origin (empty string -> relative requests). The
 *    Worker serves both the app and the API, so the deployed/preview origin is
 *    always correct without baking a hostname into the bundle.
 * 3. `http://localhost:8787` - Default fallback for local development
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

  if (import.meta.env.PROD) {
    return '';
  }

  return DEFAULT_API_URL;
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
