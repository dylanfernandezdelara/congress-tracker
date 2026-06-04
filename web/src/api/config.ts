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
 * 1. `import.meta.env.VITE_API_URL` - Environment variable (set in .env or build)
 * 2. `http://localhost:8787` - Default fallback for local development
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
