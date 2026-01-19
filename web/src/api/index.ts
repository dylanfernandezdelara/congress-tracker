/**
 * API module for fetching Senate voting data.
 *
 * @example
 * ```ts
 * import { fetchLatestNY, getApiBaseUrl } from './api';
 * import type { LatestStateResponse, Vote, VoteMember } from './api';
 *
 * const data = await fetchLatestNY();
 * ```
 */

// Types
export type {
  ActivityItem,
  ActivitySource,
  ActivityType,
  BillRef,
  CommitteeMeetingItem,
  DailyDigestItem,
  FloorScheduleItem,
  LegislationActionItem,
  MemberActivityContext,
  MemberActivityResponse,
  MemberIndexEntry,
  MemberIndexResponse,
  SourceError,
} from './types';

// Config helpers
export {
  getApiBaseUrl,
  getApiUrlOverride,
  setApiUrlOverride,
} from './config';

// API client
export { ApiError, fetchMemberLatest, fetchMembersIndex } from './client';
