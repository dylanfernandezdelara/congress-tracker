/**
 * API client for fetching Senate voting data.
 *
 * Provides typed fetch helpers with proper error handling.
 */

import { getApiBaseUrl } from './config';
import type { LatestStateResponse } from './types';

/**
 * Custom error class for API fetch failures.
 * Provides human-readable error messages and access to the original response.
 */
export class ApiError extends Error {
  /** HTTP status code of the failed response */
  readonly status: number;
  /** HTTP status text of the failed response */
  readonly statusText: string;

  constructor(message: string, status: number, statusText: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
  }
}

/**
 * Fetches the latest voting data for New York senators.
 *
 * Makes a request to `GET /state/NY/latest.json` and returns typed data.
 *
 * @returns Promise resolving to the latest NY state voting data
 * @throws {ApiError} When the API returns a non-OK response (with human-readable message)
 * @throws {Error} When a network error occurs
 *
 * @example
 * ```ts
 * try {
 *   const data = await fetchLatestNY();
 *   console.log(`Votes from ${data.vote_date}:`, data.votes.length);
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     console.error(`API error (${error.status}): ${error.message}`);
 *   } else {
 *     console.error('Network error:', error);
 *   }
 * }
 * ```
 */
export async function fetchLatestNY(): Promise<LatestStateResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/state/NY/latest.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    // Network error (e.g., no internet, CORS blocked, DNS failure)
    throw new Error(
      `Failed to connect to the API. Please check your internet connection and try again.`
    );
  }

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(response.status, url),
      response.status,
      response.statusText
    );
  }

  // Parse JSON response
  try {
    const data: LatestStateResponse = await response.json();
    return data;
  } catch {
    throw new Error(
      'The API returned invalid data. Please try again later.'
    );
  }
}

/**
 * Generates a human-readable error message for common HTTP status codes.
 *
 * @param status - HTTP status code
 * @param url - The URL that was requested (for context in error messages)
 * @returns A human-readable error message
 */
function getErrorMessage(status: number, _url: string): string {
  switch (status) {
    case 404:
      return 'No voting data found for New York. Data may not be available yet for today.';
    case 403:
      return 'Access to voting data is forbidden. Please check your API configuration.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'The server encountered an error. Please try again later.';
    case 502:
    case 503:
    case 504:
      return 'The server is temporarily unavailable. Please try again later.';
    default:
      return `Failed to fetch voting data (HTTP ${status}). Please try again.`;
  }
}
