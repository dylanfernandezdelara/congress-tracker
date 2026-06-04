/**
 * Summary scoring helpers.
 */

import { buildBillKey } from "../congress";
import type { ActivityItem, BillRef } from "../types";

export function recencyBonus(latestDate: string | undefined, referenceDate: string): number {
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
