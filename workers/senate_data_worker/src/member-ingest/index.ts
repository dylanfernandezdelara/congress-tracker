/**
 * Ingestion orchestration for per-member daily activity.
 */

import {
  fetchXmlWithRetry,
  type FetchConfig,
} from "../fetch";
import { todayEastern, subtractDays } from "../date-parse";
import {
  fetchDailyCongressionalRecordSenateArticles,
  fetchCurrentSenators,
  fetchBillDetailsMap,
  buildBillKey,
  fetchMemberLegislationActions,
  fetchSenateCommitteeMeetings,
} from "../congress";
import {
  fetchDailyDigest,
  fetchCrecSenateGranuleHighlights,
} from "../govinfo";
import {
  getCommitteeScheduleUrl,
  getFloorScheduleUrl,
  parseCommitteeScheduleXml,
  parseFloorScheduleXml,
} from "../senate-schedule";
import { mapWithConcurrency } from "../concurrency";
import type {
  CommitteeMeetingItem,
  CongressCommitteeMeetingItem,
  DailyDigestItem,
  FloorScheduleItem,
  GovInfoCrecGranuleHighlightItem,
  MemberActivityJson,
  MemberIndexJson,
  SenateRecordArticleItem,
  SourceError,
} from "../types";
import { applyActivityMetadata, buildActivityIndex, getActivityDate } from "./activity";
import { buildFeaturedSenators, buildMemberSummary } from "./summary";
import {
  DEFAULT_FETCH_CONFIG,
  DEFAULT_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  MIN_WINDOW_DAYS,
  type MemberIngestConfig,
  type MemberIngestResult,
} from "./config";
import { fetchVoteActivities } from "./vote-activities";
import { formatUtcIso } from "./summary-helpers";

export type { MemberIngestConfig, MemberIngestResult } from "./config";

export async function runMemberIngestion(
  config: MemberIngestConfig,
  fetchConfig: FetchConfig = DEFAULT_FETCH_CONFIG
): Promise<MemberIngestResult> {
  const effectiveFetchConfig: FetchConfig = config.fixture
    ? { ...fetchConfig, fixture: config.fixture }
    : fetchConfig;
  fetchConfig = effectiveFetchConfig;
  const lookbackDays = Math.max(
    MIN_WINDOW_DAYS,
    Math.min(config.lookbackDays ?? DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS)
  );
  const generatedAt = new Date().toISOString();
  const windowEnd = todayEastern(config.now);
  const windowStart = subtractDays(windowEnd, lookbackDays - 1);
  const errors: SourceError[] = [];

  const floorSchedule: FloorScheduleItem[] = [];
  const committeeMeetings: CommitteeMeetingItem[] = [];
  let dailyDigest: DailyDigestItem[] = [];
  let congressCommitteeMeetings: CongressCommitteeMeetingItem[] = [];
  let senateRecordArticles: SenateRecordArticleItem[] = [];
  let senateGranuleHighlights: GovInfoCrecGranuleHighlightItem[] = [];

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

  const digestDates = windowEnd === windowStart ? [windowEnd] : [windowEnd, windowStart];
  let digestError: string | undefined;
  for (const date of digestDates) {
    const digestResult = await fetchDailyDigest(
      date,
      config.govInfoApiKey,
      fetchConfig
    );
    if (digestResult.item) {
      dailyDigest = [digestResult.item];
      break;
    }
    if (digestResult.error) {
      digestError = digestResult.error;
    }
  }
  if (digestError && dailyDigest.length === 0) {
    errors.push({
      source: "govinfo",
      message: digestError,
    });
  }

  const endDateUtc = new Date(`${windowEnd}T23:59:59Z`);
  const startDateUtc = new Date(`${windowStart}T00:00:00Z`);
  const upcomingEndUtc = new Date(endDateUtc.getTime() + 30 * 86_400_000);
  const recordLookbackDays = Math.max(14, lookbackDays);
  const recordWindowStartUtc = new Date(endDateUtc.getTime() - recordLookbackDays * 86_400_000);

  const committeeAdapterResult = await fetchSenateCommitteeMeetings(
    config.congress,
    config.congressApiKey,
    fetchConfig,
    {
      fromDateTime: formatUtcIso(startDateUtc),
      toDateTime: formatUtcIso(upcomingEndUtc),
      maxMeetings: 120,
    }
  );
  congressCommitteeMeetings = committeeAdapterResult.meetings;
  if (committeeAdapterResult.error) {
    errors.push({
      source: "congress",
      message: committeeAdapterResult.error,
    });
  }

  const dailyRecordResult = await fetchDailyCongressionalRecordSenateArticles(
    config.congressApiKey,
    fetchConfig,
    {
      issueLimit: 24,
      maxArticles: 120,
    }
  );
  senateRecordArticles = dailyRecordResult.articles;
  if (dailyRecordResult.error) {
    errors.push({
      source: "congress",
      message: dailyRecordResult.error,
    });
  }

  const granuleResult = await fetchCrecSenateGranuleHighlights(
    formatUtcIso(recordWindowStartUtc).slice(0, 10),
    formatUtcIso(endDateUtc).slice(0, 10),
    config.govInfoApiKey,
    fetchConfig,
    {
      maxPackages: 8,
      maxGranulesPerPackage: 120,
    }
  );
  senateGranuleHighlights = granuleResult.items.map((item) => ({
    ...item,
    source: "govinfo",
  }));
  if (granuleResult.error) {
    errors.push({
      source: "govinfo",
      message: granuleResult.error,
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
      activityIndex: null,
      context: {
        floor_schedule: floorSchedule,
        committee_meetings: committeeMeetings,
        daily_digest: dailyDigest,
        committee_meetings_congress: congressCommitteeMeetings,
        senate_record_articles: senateRecordArticles,
        senate_granule_highlights: senateGranuleHighlights,
      },
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
    committee_meetings_congress: congressCommitteeMeetings,
    senate_record_articles: senateRecordArticles,
    senate_granule_highlights: senateGranuleHighlights,
  };

  const voteActivitiesByMember = await fetchVoteActivities(
    members,
    config.congress,
    config.session,
    windowStart,
    windowEnd,
    fetchConfig,
    errors,
    config.menuVotes
  );

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

      const voteActivities = voteActivitiesByMember.get(member.bioguide_id) ?? [];
      const activities = [...sponsored.actions, ...cosponsored.actions, ...voteActivities].sort(
        (a, b) => getActivityDate(b).localeCompare(getActivityDate(a))
      );

      const payload: MemberActivityJson = {
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
      };
      return payload;
    }
  );

  const billRefs = memberActivities.flatMap((activity) => {
    const refs = [];
    for (const item of activity.activities) {
      if (
        (item.type === "legislation_action" || item.type === "roll_call_vote") &&
        item.bill
      ) {
        refs.push(item.bill);
      }
    }
    return refs;
  });
  const billDetailsByKey =
    billRefs.length > 0
      ? await fetchBillDetailsMap(billRefs, config.congressApiKey, fetchConfig)
      : new Map();

  if (billDetailsByKey.size > 0) {
    for (const activity of memberActivities) {
      for (const item of activity.activities) {
        if (item.type !== "legislation_action" && item.type !== "roll_call_vote") continue;
        if (!item.bill) continue;
        const key = buildBillKey(item.bill);
        const details = billDetailsByKey.get(key);
        if (details) {
          item.bill = { ...item.bill, ...details };
        }
      }
    }
  }

  for (const activity of memberActivities) {
    for (const item of activity.activities) {
      applyActivityMetadata(activity.member.bioguide_id, item);
    }
    activity.summary = buildMemberSummary(activity);
  }

  const featuredSenators = buildFeaturedSenators(memberActivities);

  const activityIndex = buildActivityIndex(
    memberActivities,
    windowStart,
    windowEnd,
    generatedAt,
    featuredSenators
  );

  return {
    success: true,
    windowStart,
    windowEnd,
    generatedAt,
    membersIndex,
    memberActivities,
    activityIndex,
    context,
    errors,
  };
}
