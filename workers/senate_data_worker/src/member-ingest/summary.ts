/**
 * Member activity summary and featured senator ranking.
 */

import { compareDates } from "../date-parse";
import type {
  ActivityItem,
  FeaturedSenatorEntry,
  MemberActivityJson,
  MemberDeterministicSummary,
  MemberInsight,
  RollCallVoteItem,
} from "../types";
import { getActivityDate } from "./activity";
import {
  recencyBonus,
  getMemberBillKeySet,
  intersectsMemberBills,
  takeFirstEvidence,
} from "./summary-helpers";

const FEATURED_LIMIT = 6;
const CRITICAL_SOURCES = new Set(["congress", "senate", "govinfo"]);

export function buildMemberSummary(
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

export function buildFeaturedSenators(memberActivities: MemberActivityJson[]): FeaturedSenatorEntry[] {
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
