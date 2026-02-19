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
  fetchDailyCongressionalRecordSenateArticles,
  fetchCurrentSenators,
  fetchBillDetailsMap,
  buildBillKey,
  fetchMemberLegislationActions,
  fetchSenateCommitteeMeetings,
} from "./congress";
import {
  fetchDailyDigest,
  fetchCrecSenateGranuleHighlights,
} from "./govinfo";
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
  CongressCommitteeMeetingItem,
  DailyDigestItem,
  FeaturedSenatorEntry,
  FloorScheduleItem,
  GovInfoCrecGranuleHighlightItem,
  MemberIndexEntry,
  MemberActivityJson,
  MemberDeterministicSummary,
  MemberIndexJson,
  RollCallVoteItem,
  SourceError,
  MemberInsight,
  BillRef,
  SenateRecordArticleItem,
} from "./types";

export interface MemberIngestConfig {
  congress: number;
  session: number;
  congressApiKey: string;
  govInfoApiKey: string;
  lookbackDays?: number;
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

const DEFAULT_WINDOW_DAYS = 30;
const MIN_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 120;

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

const FEATURED_LIMIT = 6;
const CRITICAL_SOURCES = new Set(["congress", "senate", "govinfo"]);

function normalizePartyCode(value: string | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized.startsWith("D")) return "D";
  if (normalized.startsWith("R")) return "R";
  if (normalized === "I" || normalized.startsWith("IND")) return "I";
  return normalized;
}

function normalizeVoteCast(value: string): string {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return "UNKNOWN";
  if (cleaned.includes("yea") || cleaned.includes("aye") || cleaned === "yes") {
    return "YEA";
  }
  if (cleaned.includes("nay") || cleaned === "no") {
    return "NAY";
  }
  if (cleaned.includes("present")) {
    return "PRESENT";
  }
  if (cleaned.includes("not voting") || cleaned.includes("absent")) {
    return "NOT_VOTING";
  }
  return cleaned.toUpperCase().replace(/\s+/g, "_");
}

function computePartyMajorityByParty(memberVotes: MemberVote[]): Map<string, string> {
  const partyCounts = new Map<string, Map<string, number>>();
  for (const vote of memberVotes) {
    const party = normalizePartyCode(vote.party);
    if (!party) continue;
    const voteCast = normalizeVoteCast(vote.vote_cast);
    const counts = partyCounts.get(party) ?? new Map<string, number>();
    counts.set(voteCast, (counts.get(voteCast) ?? 0) + 1);
    partyCounts.set(party, counts);
  }

  const majorityByParty = new Map<string, string>();
  for (const [party, counts] of partyCounts.entries()) {
    let bestVote = "";
    let bestCount = -1;
    let tied = false;
    for (const [voteCast, count] of counts.entries()) {
      if (count > bestCount) {
        bestVote = voteCast;
        bestCount = count;
        tied = false;
      } else if (count === bestCount) {
        tied = true;
      }
    }
    if (!tied && bestVote) {
      majorityByParty.set(party, bestVote);
    }
  }
  return majorityByParty;
}

function recencyBonus(latestDate: string | undefined, referenceDate: string): number {
  if (!latestDate) return 0;
  const latest = new Date(`${latestDate}T00:00:00Z`).getTime();
  const reference = new Date(`${referenceDate}T00:00:00Z`).getTime();
  if (Number.isNaN(latest) || Number.isNaN(reference)) return 0;
  const days = Math.max(0, Math.round((reference - latest) / 86_400_000));
  if (days <= 0) return 5;
  if (days === 1) return 4;
  if (days <= 2) return 3;
  if (days <= 4) return 2;
  if (days <= 6) return 1;
  return 0;
}

function formatUtcIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function getMemberBillKeySet(activities: ActivityItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of activities) {
    if ((item.type === "legislation_action" || item.type === "roll_call_vote") && item.bill) {
      keys.add(buildBillKey(item.bill));
    }
  }
  return keys;
}

function intersectsMemberBills(
  meetingBills: BillRef[],
  memberBillKeys: Set<string>
): boolean {
  for (const bill of meetingBills) {
    if (memberBillKeys.has(buildBillKey(bill))) {
      return true;
    }
  }
  return false;
}

function takeFirstEvidence<T>(items: T[], limit = 3): T[] {
  if (items.length <= limit) return items;
  return items.slice(0, limit);
}

function buildMemberSummary(
  activity: MemberActivityJson
): MemberDeterministicSummary {
  const activities = activity.activities;
  const memberBillKeys = getMemberBillKeySet(activities);
  const latestActivityDate = activities[0] ? getActivityDate(activities[0]) : undefined;

  const recentSponsored = activities.filter(
    (item) =>
      item.type === "legislation_action" &&
      item.role === "sponsor" &&
      item.is_recent !== false
  );
  const recentCosponsored = activities.filter(
    (item) =>
      item.type === "legislation_action" &&
      item.role === "cosponsor" &&
      item.is_recent !== false
  );

  const defectionVotes = activities.filter(
    (item): item is RollCallVoteItem =>
      item.type === "roll_call_vote" && item.against_party_majority === true
  );

  const upcomingMeetings = (activity.context.committee_meetings_congress ?? []).filter((meeting) => {
    if (!meeting.date) return false;
    return compareDates(meeting.date, activity.window.end_date) >= 0;
  });
  const matchedUpcoming = upcomingMeetings.filter(
    (meeting) =>
      meeting.nomination_signals.length > 0 ||
      (meeting.related_nominations?.length ?? 0) > 0 ||
      (meeting.related_treaties?.length ?? 0) > 0 ||
      intersectsMemberBills(meeting.related_bills, memberBillKeys)
  );

  const senateHighlights = (activity.context.senate_granule_highlights ?? []).filter((highlight) =>
    (highlight.member_bioguide_ids ?? []).includes(activity.member.bioguide_id)
  );

  const topicCounts = new Map<string, number>();
  for (const item of activities) {
    for (const topic of item.topics ?? []) {
      if (!topic) continue;
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([topic]) => topic);

  let score = 0;
  const reasons: string[] = [];
  const insights: MemberInsight[] = [];

  if (defectionVotes.length > 0) {
    const defectionScore = Math.min(defectionVotes.length, 2) * 8;
    score += defectionScore;
    reasons.push(
      `Voted against party majority ${defectionVotes.length} time${defectionVotes.length === 1 ? "" : "s"}`
    );
    insights.push({
      id: "party_defection",
      kind: "party_defection",
      title: "Party-defection signal",
      detail:
        defectionVotes.length === 1
          ? "This senator voted against their party's majority position on the latest vote day."
          : `This senator voted against their party's majority position ${defectionVotes.length} times in the current window.`,
      score: defectionScore,
      evidence: takeFirstEvidence(
        defectionVotes.map((vote) => ({
          source: vote.source,
          label: `Roll call ${vote.vote_number}: ${vote.vote_cast} vs party majority ${vote.party_majority_vote ?? "unknown"}`,
          date: vote.vote_date,
          url: vote.url,
          vote_number: vote.vote_number,
          bill: vote.bill,
        }))
      ),
    });
  }

  if (recentSponsored.length > 0) {
    score += 6;
    reasons.push("Recent sponsored legislation action");
  }

  if (recentCosponsored.length > 0) {
    score += 3;
    reasons.push("Recent cosponsored legislation action");
  }

  if (matchedUpcoming.length > 0) {
    score += 4;
    reasons.push("Upcoming committee item linked to bills/nominations");
    insights.push({
      id: "upcoming_focus",
      kind: "upcoming_focus",
      title: "Upcoming focus",
      detail:
        matchedUpcoming.length === 1
          ? "One upcoming committee item matches this senator's active bill/nomination context."
          : `${matchedUpcoming.length} upcoming committee items match this senator's active bill/nomination context.`,
      score: 4,
      evidence: takeFirstEvidence(
        matchedUpcoming.map((meeting) => ({
          source: meeting.source,
          label: meeting.title,
          date: meeting.date,
          url: meeting.url,
        }))
      ),
    });
  }

  if (senateHighlights.length > 0) {
    score += 2;
    reasons.push("Recent Senate floor/congressional record highlight");
    insights.push({
      id: "recent_session",
      kind: "recent_session",
      title: "Recent session highlight",
      detail:
        senateHighlights.length === 1
          ? "This senator appears in one recent Senate congressional-record highlight."
          : `This senator appears in ${senateHighlights.length} recent Senate congressional-record highlights.`,
      score: 2,
      evidence: takeFirstEvidence(
        senateHighlights.map((highlight) => ({
          source: highlight.source,
          label: highlight.title,
          date: highlight.date,
          url: highlight.text_url ?? highlight.pdf_url,
        }))
      ),
    });
  }

  if (topTopics.length > 0) {
    insights.push({
      id: "topic_focus",
      kind: "topic_focus",
      title: "Topic focus",
      detail: `Top recurring topics: ${topTopics.join(", ")}.`,
      score: 1,
      evidence: topTopics.map((topic) => ({
        source: "congress",
        label: topic,
      })),
    });
  }

  score += recencyBonus(latestActivityDate, activity.window.end_date);
  if (activity.partial && activity.errors.some((error) => CRITICAL_SOURCES.has(error.source))) {
    score -= 10;
    reasons.push("Limited source coverage (partial data)");
  }

  if (reasons.length === 0) {
    reasons.push("Recent Senate activity context");
  }

  const latestBillActivity = activities.find(
    (item): item is Exclude<ActivityItem, RollCallVoteItem> =>
      item.type === "legislation_action"
  );
  const latestVote = activities.find(
    (item): item is RollCallVoteItem => item.type === "roll_call_vote"
  );
  const deterministicPoints: string[] = [];
  if (latestBillActivity && latestBillActivity.type === "legislation_action") {
    deterministicPoints.push(
      `Most recent legislation action: ${latestBillActivity.action_text}`
    );
  }
  if (latestVote) {
    deterministicPoints.push(
      `Latest roll call participation: vote ${latestVote.vote_number} (${latestVote.vote_cast}).`
    );
  }
  if (matchedUpcoming[0]) {
    deterministicPoints.push(`Upcoming committee focus: ${matchedUpcoming[0].title}`);
  }
  if (deterministicPoints.length === 0 && latestActivityDate) {
    deterministicPoints.push(`Most recent activity date: ${latestActivityDate}`);
  }

  return {
    featured_score: score,
    featured_reasons: reasons,
    latest_activity_date: latestActivityDate,
    deterministic_points: deterministicPoints,
    insights,
  };
}

function buildFeaturedSenators(memberActivities: MemberActivityJson[]): FeaturedSenatorEntry[] {
  const ranked = memberActivities
    .map((activity) => ({
      bioguide_id: activity.member.bioguide_id,
      score: activity.summary?.featured_score ?? 0,
      reasons: activity.summary?.featured_reasons ?? [],
      latest_activity_date: activity.summary?.latest_activity_date,
      latest_vote_date:
        activity.activities.find((item) => item.type === "roll_call_vote")?.vote_date ?? "",
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const dateA = a.latest_activity_date ?? "";
      const dateB = b.latest_activity_date ?? "";
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      if (b.latest_vote_date !== a.latest_vote_date) {
        return b.latest_vote_date.localeCompare(a.latest_vote_date);
      }
      return a.bioguide_id.localeCompare(b.bioguide_id);
    })
    .slice(0, FEATURED_LIMIT)
    .map((item) => ({
      bioguide_id: item.bioguide_id,
      score: item.score,
      reasons: item.reasons,
      latest_activity_date: item.latest_activity_date,
    }));

  return ranked;
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
  generatedAt: string,
  featuredSenators: FeaturedSenatorEntry[]
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
    featured_senators: featuredSenators,
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
    const partyMajorityByParty = computePartyMajorityByParty(details.member_votes);
    for (const vote of details.member_votes) {
      const member = matchMemberForVote(vote, membersByState);
      if (!member) continue;
      const normalizedParty = normalizePartyCode(vote.party);
      const normalizedVoteCast = normalizeVoteCast(vote.vote_cast);
      const partyMajorityVote = normalizedParty
        ? partyMajorityByParty.get(normalizedParty)
        : undefined;
      const againstPartyMajority =
        Boolean(partyMajorityVote) && partyMajorityVote !== normalizedVoteCast;
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
        party: normalizedParty || undefined,
        party_majority_vote: partyMajorityVote,
        against_party_majority: againstPartyMajority,
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
  const lookbackDays = Math.max(
    MIN_WINDOW_DAYS,
    Math.min(config.lookbackDays ?? DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS)
  );
  const generatedAt = new Date().toISOString();
  const windowEnd = todayEastern();
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
    errors,
  };
}
