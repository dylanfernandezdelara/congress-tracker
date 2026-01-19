/**
 * Ingestion orchestration for per-member daily activity.
 */

import { fetchXmlWithRetry, type FetchConfig } from "./fetch";
import { todayEastern, subtractDays } from "./date-parse";
import {
  fetchCurrentSenators,
  fetchMemberLegislationActions,
} from "./congress";
import { fetchDailyDigest } from "./govinfo";
import {
  getCommitteeScheduleUrl,
  getFloorScheduleUrl,
  parseCommitteeScheduleXml,
  parseFloorScheduleXml,
} from "./senate-schedule";
import { mapWithConcurrency } from "./concurrency";
import type {
  CommitteeMeetingItem,
  DailyDigestItem,
  FloorScheduleItem,
  MemberActivityJson,
  MemberIndexJson,
  SourceError,
} from "./types";

export interface MemberIngestConfig {
  congress: number;
  congressApiKey: string;
  govInfoApiKey: string;
}

export interface MemberIngestResult {
  success: boolean;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  membersIndex: MemberIndexJson | null;
  memberActivities: MemberActivityJson[];
  errors: SourceError[];
  error?: string;
}

const DEFAULT_FETCH_CONFIG: FetchConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 15000,
  concurrency: 5,
};

export async function runMemberIngestion(
  config: MemberIngestConfig,
  fetchConfig: FetchConfig = DEFAULT_FETCH_CONFIG
): Promise<MemberIngestResult> {
  const generatedAt = new Date().toISOString();
  const windowEnd = todayEastern();
  const windowStart = subtractDays(windowEnd, 1);
  const errors: SourceError[] = [];

  const floorSchedule: FloorScheduleItem[] = [];
  const committeeMeetings: CommitteeMeetingItem[] = [];
  let dailyDigest: DailyDigestItem[] = [];

  const floorResult = await fetchXmlWithRetry(getFloorScheduleUrl(), fetchConfig);
  if (floorResult.success && floorResult.data) {
    floorSchedule.push(...parseFloorScheduleXml(floorResult.data, windowEnd));
  } else {
    errors.push({
      source: "senate",
      message: `Floor schedule fetch failed: ${floorResult.error ?? "unknown error"}`,
    });
  }

  const committeeResult = await fetchXmlWithRetry(
    getCommitteeScheduleUrl(),
    fetchConfig
  );
  if (committeeResult.success && committeeResult.data) {
    committeeMeetings.push(
      ...parseCommitteeScheduleXml(committeeResult.data, windowEnd)
    );
  } else {
    errors.push({
      source: "senate",
      message: `Committee schedule fetch failed: ${committeeResult.error ?? "unknown error"}`,
    });
  }

  const digestResult = await fetchDailyDigest(
    windowStart,
    config.govInfoApiKey,
    fetchConfig
  );
  if (digestResult.item) {
    dailyDigest = [digestResult.item];
  }
  if (digestResult.error) {
    errors.push({
      source: "govinfo",
      message: digestResult.error,
    });
  }

  const members = await fetchCurrentSenators(
    config.congress,
    config.congressApiKey,
    fetchConfig
  );

  if (members.length === 0) {
    return {
      success: false,
      windowStart,
      windowEnd,
      generatedAt,
      membersIndex: null,
      memberActivities: [],
      errors,
      error: "No current Senators returned by Congress.gov API",
    };
  }

  const membersIndex: MemberIndexJson = {
    congress: config.congress,
    generated_at: generatedAt,
    members,
  };

  const context = {
    floor_schedule: floorSchedule,
    committee_meetings: committeeMeetings,
    daily_digest: dailyDigest,
  };

  const concurrency = Math.min(fetchConfig.concurrency ?? 4, 6);
  const memberActivities = await mapWithConcurrency(
    members,
    concurrency,
    async (member) => {
      const memberErrors: SourceError[] = [];

      const sponsored = await fetchMemberLegislationActions(
        member.bioguide_id,
        config.congress,
        "sponsor",
        windowStart,
        windowEnd,
        config.congressApiKey,
        fetchConfig
      );
      if (sponsored.error) {
        memberErrors.push({
          source: "congress",
          message: `Sponsored legislation fetch failed: ${sponsored.error}`,
        });
      }

      const cosponsored = await fetchMemberLegislationActions(
        member.bioguide_id,
        config.congress,
        "cosponsor",
        windowStart,
        windowEnd,
        config.congressApiKey,
        fetchConfig
      );
      if (cosponsored.error) {
        memberErrors.push({
          source: "congress",
          message: `Cosponsored legislation fetch failed: ${cosponsored.error}`,
        });
      }

      const activities = [...sponsored.actions, ...cosponsored.actions].sort(
        (a, b) => b.action_date.localeCompare(a.action_date)
      );

      return {
        member,
        congress: config.congress,
        generated_at: generatedAt,
        window: {
          start_date: windowStart,
          end_date: windowEnd,
        },
        activities,
        context,
        partial: errors.length > 0 || memberErrors.length > 0,
        errors: [...errors, ...memberErrors],
      } satisfies MemberActivityJson;
    }
  );

  return {
    success: true,
    windowStart,
    windowEnd,
    generatedAt,
    membersIndex,
    memberActivities,
    errors,
  };
}
