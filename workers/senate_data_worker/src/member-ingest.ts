/**
 * Ingestion orchestration for per-member daily activity.
 */

import {
  buildVoteDetailUrl,
  fetchVoteDetailsParallel,
  fetchVoteMenu,
  fetchXmlWithRetry,
  type FetchConfig,
} from "./fetch";
import { compareDates, todayEastern, subtractDays } from "./date-parse";
import {
  fetchCurrentSenators,
  fetchBillDetailsMap,
  buildBillKey,
  fetchMemberLegislationActions,
} from "./congress";
import { fetchDailyDigest } from "./govinfo";
import {
  getCommitteeScheduleUrl,
  getFloorScheduleUrl,
  parseCommitteeScheduleXml,
  parseFloorScheduleXml,
} from "./senate-schedule";
import { parseVoteDetailXml, parseVoteMenuXml, type MemberVote } from "./xml";
import { mapWithConcurrency } from "./concurrency";
import type {
  ActivityIndexJson,
  ActivityIndexEntry,
  ActivityItem,
  CommitteeMeetingItem,
  DailyDigestItem,
  FloorScheduleItem,
  MemberIndexEntry,
  MemberActivityJson,
  MemberIndexJson,
  RollCallVoteItem,
  SourceError,
} from "./types";

export interface MemberIngestConfig {
  congress: number;
  session: number;
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
  activityIndex: ActivityIndexJson | null;
  errors: SourceError[];
  error?: string;
}

const WINDOW_DAYS = 7;

const DEFAULT_FETCH_CONFIG: FetchConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 15000,
  concurrency: 5,
};

type VoteActivitiesByMember = Map<string, RollCallVoteItem[]>;

function isDateInRange(date: string, start: string, end: string): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

function extractNameParts(raw: string): {
  full: string;
  last: string;
  first?: string;
  firstInitial?: string;
} {
  const withoutParens = raw.replace(/\s*\(.*\)\s*$/, "").trim();
  if (!withoutParens) {
    return { full: "", last: "" };
  }
  if (withoutParens.includes(",")) {
    const [last, rest] = withoutParens.split(",", 2).map((part) => part.trim());
    const first = rest?.split(/\s+/)[0];
    return {
      full: withoutParens,
      last: last || withoutParens,
      first,
      firstInitial: first ? first[0]?.toLowerCase() : undefined,
    };
  }
  const parts = withoutParens.split(/\s+/);
  const last = parts[parts.length - 1] ?? withoutParens;
  const first = parts[0];
  return {
    full: withoutParens,
    last,
    first,
    firstInitial: first ? first[0]?.toLowerCase() : undefined,
  };
}

function buildMembersByState(
  members: MemberIndexEntry[]
): Map<string, MemberIndexEntry[]> {
  const byState = new Map<string, MemberIndexEntry[]>();
  for (const member of members) {
    const state = member.state.toUpperCase();
    const list = byState.get(state) ?? [];
    list.push(member);
    byState.set(state, list);
  }
  return byState;
}

function matchMemberForVote(
  vote: MemberVote,
  membersByState: Map<string, MemberIndexEntry[]>
): MemberIndexEntry | null {
  const candidates = membersByState.get(vote.state.toUpperCase()) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const voteName = extractNameParts(vote.member_full);
  const matchingLast = candidates.filter((member) => {
    const memberName = extractNameParts(member.name);
    return memberName.last.toLowerCase() === voteName.last.toLowerCase();
  });

  if (matchingLast.length === 1) return matchingLast[0];
  if (matchingLast.length > 1 && voteName.firstInitial) {
    const matchingFirst = matchingLast.filter((member) => {
      const memberName = extractNameParts(member.name);
      return memberName.firstInitial === voteName.firstInitial;
    });
    if (matchingFirst.length === 1) return matchingFirst[0];
    return matchingFirst[0] ?? matchingLast[0] ?? null;
  }

  return matchingLast[0] ?? candidates[0] ?? null;
}

function extractBillRefFromText(
  text: string,
  congress: number
): RollCallVoteItem["bill"] | null {
  const match = text.match(
    /\b(S\.?J\.?RES\.?|S\.?CON\.?RES\.?|S\.?RES\.?|S\.?|H\.?J\.?RES\.?|H\.?CON\.?RES\.?|H\.?RES\.?|H\.?R\.?)\s*\.?\s*(\d+)\b/i
  );
  if (!match) return null;
  const rawType = match[1].toUpperCase().replace(/\s+/g, "");
  const number = match[2];
  const normalized = rawType.replace(/\./g, "");
  const type =
    normalized === "HR"
      ? "H.R."
      : normalized === "S"
        ? "S"
        : normalized === "HJRES"
          ? "H.J.RES."
          : normalized === "SJRES"
            ? "S.J.RES."
            : normalized === "HRES"
              ? "H.RES."
              : normalized === "SRES"
                ? "S.RES."
                : normalized === "HCONRES"
                  ? "H.CON.RES."
                  : normalized === "SCONRES"
                    ? "S.CON.RES."
                    : rawType;
  return {
    congress,
    type,
    number,
  };
}

function extractBillRefFromVote(details: {
  congress: number;
  vote_document?: string;
  vote_title?: string;
  vote_question?: string;
}): RollCallVoteItem["bill"] | null {
  const candidates = [
    details.vote_document,
    details.vote_title,
    details.vote_question,
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    const bill = extractBillRefFromText(candidate, details.congress);
    if (bill) return bill;
  }
  return null;
}

function extractTopicsFromBill(bill: RollCallVoteItem["bill"]): string[] {
  if (!bill) return [];
  const topics = new Set<string>();
  if (bill.policy_area) topics.add(bill.policy_area);
  for (const subject of bill.subjects ?? []) {
    if (subject) topics.add(subject);
  }
  for (const committee of bill.committees ?? []) {
    if (committee?.name) topics.add(committee.name);
  }
  return Array.from(topics);
}

function getActivityDate(activity: ActivityItem): string {
  switch (activity.type) {
    case "legislation_action":
      return activity.action_date;
    case "roll_call_vote":
      return activity.vote_date;
    case "floor_schedule":
      return activity.date;
    case "committee_meeting":
      return activity.date;
    case "daily_digest":
      return activity.date;
    default:
      return "";
  }
}

function getActivityKey(activity: ActivityItem): string | null {
  switch (activity.type) {
    case "legislation_action": {
      const billKey = buildBillKey(activity.bill);
      return `${activity.source}:legislation_action:${activity.role}:${activity.action_date}:${billKey}`;
    }
    case "roll_call_vote":
      return `${activity.source}:roll_call_vote:${activity.vote_date}:${activity.vote_number}`;
    default:
      return null;
  }
}

function applyActivityMetadata(
  memberId: string,
  activity: ActivityItem
): void {
  const key = getActivityKey(activity);
  if (key) {
    activity.activity_id = `${memberId}:${key}`;
  }
  if (
    (activity.type === "legislation_action" || activity.type === "roll_call_vote") &&
    activity.bill
  ) {
    const topics = extractTopicsFromBill(activity.bill);
    activity.topics = topics.length ? topics : undefined;
  }
}

function buildActivityIndex(
  memberActivities: MemberActivityJson[],
  windowStart: string,
  windowEnd: string,
  generatedAt: string
): ActivityIndexJson {
  const index = new Map<string, ActivityIndexEntry>();

  for (const activityJson of memberActivities) {
    const memberId = activityJson.member.bioguide_id;
    for (const item of activityJson.activities) {
      const key = getActivityKey(item);
      if (!key) continue;
      const entry = index.get(key);
      if (entry) {
        if (!entry.members.includes(memberId)) {
          entry.members.push(memberId);
        }
        continue;
      }

      const date = getActivityDate(item);
      const title =
        item.type === "legislation_action"
          ? item.bill?.title ?? item.action_text
          : item.type === "roll_call_vote"
            ? item.title ?? item.question ?? "Roll call vote"
            : undefined;
      const bill =
        item.type === "legislation_action" || item.type === "roll_call_vote"
          ? item.bill
          : undefined;
      const topics =
        item.type === "legislation_action" || item.type === "roll_call_vote"
          ? item.topics
          : undefined;

      index.set(key, {
        activity_id: key,
        source: item.source,
        type: item.type,
        date,
        title,
        bill,
        topics,
        members: [memberId],
      });
    }
  }

  const activities = Array.from(index.values()).map((entry) => ({
    ...entry,
    members: entry.members.sort(),
  }));
  activities.sort((a, b) => b.date.localeCompare(a.date));

  return {
    generated_at: generatedAt,
    window: { start_date: windowStart, end_date: windowEnd },
    activities,
  };
}

async function fetchVoteActivities(
  members: MemberIndexEntry[],
  congress: number,
  session: number,
  windowStart: string,
  windowEnd: string,
  fetchConfig: FetchConfig,
  errors: SourceError[]
): Promise<VoteActivitiesByMember> {
  const voteActivitiesByMember: VoteActivitiesByMember = new Map();
  const menuResult = await fetchVoteMenu(congress, session, fetchConfig);
  if (!menuResult.success || !menuResult.data) {
    errors.push({
      source: "senate",
      message: `Vote menu fetch failed: ${menuResult.error ?? "unknown error"}`,
    });
    return voteActivitiesByMember;
  }

  const allVotes = parseVoteMenuXml(menuResult.data);
  const targetVotes = allVotes.filter((vote) =>
    isDateInRange(vote.vote_date, windowStart, windowEnd)
  );

  if (targetVotes.length === 0) {
    return voteActivitiesByMember;
  }

  const voteNumbers = targetVotes.map((vote) => vote.vote_number);
  const detailsResult = await fetchVoteDetailsParallel(
    voteNumbers,
    congress,
    session,
    fetchConfig
  );

  const membersByState = buildMembersByState(members);
  for (const [voteNumber, result] of detailsResult.results.entries()) {
    if (!result.success || !result.data) {
      errors.push({
        source: "senate",
        message: `Vote detail ${voteNumber} fetch failed: ${result.error ?? "unknown error"}`,
      });
      continue;
    }
    const details = parseVoteDetailXml(result.data, congress, session);
    if (!details) {
      errors.push({
        source: "senate",
        message: `Vote detail ${voteNumber} parse failed`,
      });
      continue;
    }

    const bill = extractBillRefFromVote(details);
    const url = buildVoteDetailUrl(details.congress, details.session, details.vote_number);
    for (const vote of details.member_votes) {
      const member = matchMemberForVote(vote, membersByState);
      if (!member) continue;
      const list = voteActivitiesByMember.get(member.bioguide_id) ?? [];
      list.push({
        source: "senate",
        type: "roll_call_vote",
        vote_number: details.vote_number,
        vote_date: details.vote_date,
        title: details.vote_title,
        question: details.vote_question,
        result: details.vote_result,
        vote_cast: vote.vote_cast,
        bill: bill ?? undefined,
        url,
      });
      voteActivitiesByMember.set(member.bioguide_id, list);
    }
  }

  return voteActivitiesByMember;
}

export async function runMemberIngestion(
  config: MemberIngestConfig,
  fetchConfig: FetchConfig = DEFAULT_FETCH_CONFIG
): Promise<MemberIngestResult> {
  const generatedAt = new Date().toISOString();
  const windowEnd = todayEastern();
  const windowStart = subtractDays(windowEnd, WINDOW_DAYS - 1);
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

  const voteActivitiesByMember = await fetchVoteActivities(
    members,
    config.congress,
    config.session,
    windowStart,
    windowEnd,
    fetchConfig,
    errors
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
  }

  const activityIndex = buildActivityIndex(
    memberActivities,
    windowStart,
    windowEnd,
    generatedAt
  );

  return {
    success: true,
    windowStart,
    windowEnd,
    generatedAt,
    membersIndex,
    memberActivities,
    activityIndex,
    errors,
  };
}
