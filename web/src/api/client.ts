/**
 * API client for fetching Senate voting data.
 *
 * Provides typed fetch helpers with proper error handling.
 */

import { getApiBaseUrl } from './config';
import type {
  ActivityIndexResponse,
  HealthResponse,
  MemberActivityResponse,
  MemberIndexResponse,
  SessionOverview,
  StateMetaResponse,
  StateVotesResponse,
  VoteLedger,
} from './types';

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
 * Fetches the list of current senators.
 *
 * Makes a request to `GET /members/index.json` and returns typed data.
 *
 * @returns Promise resolving to the member index
 * @throws {ApiError} When the API returns a non-OK response (with human-readable message)
 * @throws {Error} When a network error occurs
 *
 * @example
 * ```ts
 * try {
 *   const data = await fetchMembersIndex();
 *   console.log(`Members:`, data.members.length);
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     console.error(`API error (${error.status}): ${error.message}`);
 *   } else {
 *     console.error('Network error:', error);
 *   }
 * }
 * ```
 */
export async function fetchMembersIndex(): Promise<MemberIndexResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/members/index.json`;

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
    const data: MemberIndexResponse = await response.json();
    return data;
  } catch {
    throw new Error(
      'The API returned invalid data. Please try again later.'
    );
  }
}

/**
 * Fetches the aggregated activities index and featured senator list.
 */
export async function fetchActivitiesIndex(): Promise<ActivityIndexResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/activities/index.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
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

  try {
    const data: ActivityIndexResponse = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
  }
}

/**
 * Fetches the latest activity window for a senator.
 *
 * Makes a request to `GET /member/{bioguide}/latest.json` and returns typed data.
 */
export async function fetchMemberLatest(
  bioguideId: string
): Promise<MemberActivityResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/member/${bioguideId}/latest.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
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

  try {
    const data: MemberActivityResponse = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
  }
}

/**
 * Fetches the latest vote snapshot for a state.
 *
 * Makes a request to `GET /state/{STATE}/latest.json` and returns typed data.
 */
export async function fetchStateLatest(state: string): Promise<StateVotesResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/state/${state.toUpperCase()}/latest.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
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

  try {
    const data: StateVotesResponse = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
  }
}

/**
 * Fetches the state metadata (including latest vote date).
 */
export async function fetchStateMeta(state: string): Promise<StateMetaResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/state/${state.toUpperCase()}/_meta.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
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

  try {
    const data: StateMetaResponse = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
  }
}

/**
 * Fetches a specific vote snapshot for a state and date.
 */
export async function fetchStateSnapshot(
  state: string,
  date: string
): Promise<StateVotesResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/state/${state.toUpperCase()}/${date}.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
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

  try {
    const data: StateVotesResponse = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
  }
}

/**
 * Fetches worker health/config info.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/health`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
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

  try {
    const data: HealthResponse = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
  }
}

/**
 * Fetches the chamber-wide vote ledger.
 */
export async function fetchVoteLedger(): Promise<VoteLedger> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/votes/ledger.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
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

  try {
    const data: VoteLedger = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
  }
}

/**
 * Fetches the session overview with per-senator stats.
 */
export async function fetchSessionOverview(): Promise<SessionOverview> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/stats/overview.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
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

  try {
    const data: SessionOverview = await response.json();
    return data;
  } catch {
    throw new Error('The API returned invalid data. Please try again later.');
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
      return 'No data found. Data may not be available yet.';
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
