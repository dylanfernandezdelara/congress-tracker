/**
 * Member activity metadata and index building.
 */

import { buildBillKey } from "../congress";
import type {
  ActivityIndexEntry,
  ActivityIndexJson,
  ActivityItem,
  FeaturedSenatorEntry,
  MemberActivityJson,
} from "../types";
import { extractTopicsFromBill } from "./helpers";

export function getActivityDate(activity: ActivityItem): string {
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

export function getActivityKey(activity: ActivityItem): string | null {
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

export function applyActivityMetadata(
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

export function buildActivityIndex(
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
