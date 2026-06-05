/**
 * Member summary helpers.
 */

import { buildBillKey } from "../congress";
import type { ActivityItem, BillRef } from "../types";

export function formatUtcIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function getMemberBillKeySet(activities: ActivityItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of activities) {
    if ((item.type === "legislation_action" || item.type === "roll_call_vote") && item.bill) {
      keys.add(buildBillKey(item.bill));
    }
  }
  return keys;
}

export function intersectsMemberBills(
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

export function takeFirstEvidence<T>(items: T[], limit = 3): T[] {
  if (items.length <= limit) return items;
  return items.slice(0, limit);
}
