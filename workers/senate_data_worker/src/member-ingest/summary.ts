/**
 * Member activity summary (deterministic facts only; no ranking).
 */

import { compareDates } from "../date-parse";
import type {
  ActivityItem,
  MemberActivityJson,
  MemberDeterministicSummary,
  MemberInsight,
  RollCallVoteItem,
} from "../types";
import { getActivityDate } from "./activity";
import {
  getMemberBillKeySet,
  intersectsMemberBills,
  takeFirstEvidence,
} from "./summary-helpers";

const CRITICAL_SOURCES = new Set(["congress", "senate", "govinfo"]);

export function buildMemberSummary(
  activity: MemberActivityJson
): MemberDeterministicSummary {
  const activities = activity.activities;
  const memberBillKeys = getMemberBillKeySet(activities);
  const latestActivityDate = activities[0] ? getActivityDate(activities[0]) : undefined;

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

  const insights: MemberInsight[] = [];

  if (defectionVotes.length > 0) {
    insights.push({
      id: "party_defection",
      kind: "party_defection",
      title: "Party-defection signal",
      detail:
        defectionVotes.length === 1
          ? "This senator voted against their party's majority position on the latest vote day."
          : `This senator voted against their party's majority position ${defectionVotes.length} times in the current window.`,
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

  if (matchedUpcoming.length > 0) {
    insights.push({
      id: "upcoming_focus",
      kind: "upcoming_focus",
      title: "Upcoming focus",
      detail:
        matchedUpcoming.length === 1
          ? "One upcoming committee item matches this senator's active bill/nomination context."
          : `${matchedUpcoming.length} upcoming committee items match this senator's active bill/nomination context.`,
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
    insights.push({
      id: "recent_session",
      kind: "recent_session",
      title: "Recent session highlight",
      detail:
        senateHighlights.length === 1
          ? "This senator appears in one recent Senate congressional-record highlight."
          : `This senator appears in ${senateHighlights.length} recent Senate congressional-record highlights.`,
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
      evidence: topTopics.map((topic) => ({
        source: "congress",
        label: topic,
      })),
    });
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
  if (activity.partial && activity.errors.some((error) => CRITICAL_SOURCES.has(error.source))) {
    deterministicPoints.push("Limited source coverage (partial data).");
  }

  return {
    latest_activity_date: latestActivityDate,
    deterministic_points: deterministicPoints,
    insights,
  };
}
