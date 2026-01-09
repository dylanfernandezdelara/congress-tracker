/**
 * API configuration helpers.
 *
 * Provides utilities for resolving the API base URL with a well-defined
 * priority order, supporting local development, environment configuration,
 * and user overrides.
 */

/** Default fallback API URL for local development */
const DEFAULT_API_URL = 'http://localhost:8787';

/** localStorage key for user-configured API URL override */
const LOCAL_STORAGE_KEY = 'apiUrl';

/**
 * Resolves the API base URL using the following priority order:
 *
 * 1. `localStorage.getItem('apiUrl')` - User override (useful for testing/debugging)
 * 2. `import.meta.env.VITE_API_URL` - Environment variable (set in .env or build)
 * 3. `http://localhost:8787` - Default fallback for local development
 *
 * The returned URL will NOT have a trailing slash.
 *
 * @returns The resolved API base URL
 *
 * @example
 * ```ts
 * const baseUrl = getApiBaseUrl();
 * const response = await fetch(`${baseUrl}/state/NY/latest.json`);
 * ```
 */
export function getApiBaseUrl(): string {
  // Priority 1: Check localStorage for user override
  try {
    const localStorageUrl = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localStorageUrl && localStorageUrl.trim()) {
      return normalizeUrl(localStorageUrl);
    }
  } catch {
    // localStorage may not be available (e.g., SSR, private browsing)
    // Fall through to next priority
  }

  // Priority 2: Check Vite environment variable
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return normalizeUrl(envUrl);
  }

  // Priority 3: Default fallback
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

/**
 * Sets a custom API URL override in localStorage.
 * Useful for debugging or testing against different API endpoints.
 *
 * @param url - The API base URL to use, or null to clear the override
 *
 * @example
 * ```ts
 * // Set custom URL
 * setApiUrlOverride('https://staging-api.example.com');
 *
 * // Clear override to use default resolution
 * setApiUrlOverride(null);
 * ```
 */
export function setApiUrlOverride(url: string | null): void {
  try {
    if (url === null) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, url);
    }
  } catch {
    // localStorage may not be available
    console.warn('Unable to set API URL override: localStorage not available');
  }
}

/**
 * Gets the current localStorage API URL override, if any.
 *
 * @returns The override URL or null if not set
 */
export function getApiUrlOverride(): string | null {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}
