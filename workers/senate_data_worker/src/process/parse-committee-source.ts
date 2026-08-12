import type { FeedChamber } from "../../../../shared/feed-api-types";
import { normalizeCommitteeActivity } from "../../../../shared/bill-process-labels";
import type { CongressAction } from "../lifecycle/parse-actions";
import type { UpsertCommitteeEventParams } from "../d1/bill-process";
import type {
  CongressBillCommittee,
} from "../sources/congress-client";
import { asFeedChamber } from "../sources/congress-client";

/** Pull "52 - 0" / "47–0" style tallies from committee action text. */
export function extractCommitteeTally(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(
    /(?:Yeas?\s+and\s+Nays?|yea[\s-]*nay|voice vote)[^\d]*(\d+\s*[-–—]\s*\d+)/i
  );
  if (m?.[1]) return m[1].replace(/\s+/g, "").replace(/[–—]/g, "-");
  const bare = text.match(/\b(\d+\s*[-–—]\s*\d+)\b/);
  if (bare?.[1] && /ordered to be reported|reported/i.test(text)) {
    return bare[1].replace(/\s+/g, "").replace(/[–—]/g, "-");
  }
  if (/voice vote/i.test(text)) return "voice vote";
  return null;
}

function activityAtOrFallback(date: string | undefined, fallbackIndex: number): string {
  if (date && date.trim()) return date.trim();
  // Stable synthetic timestamp so undated rows still upsert uniquely.
  return `1970-01-01T00:00:${String(fallbackIndex).padStart(2, "0")}Z`;
}

/**
 * Map /committees payload (+ optional action tallies) into upsert rows.
 * Skips interest/other noise at ingest for storage size; "sent" and advancement kept.
 */
export function parseCommitteeEvents(params: {
  congress: number;
  billType: string;
  billNumber: number;
  committees: CongressBillCommittee[];
  actions: CongressAction[];
}): UpsertCommitteeEventParams[] {
  const talliesByCommittee = new Map<string, string>();
  const talliesByDate = new Map<string, string>();
  for (const action of params.actions) {
    const text = action.text ?? "";
    const tally = extractCommitteeTally(text);
    if (!tally) continue;
    const actionDate = action.actionDate?.slice(0, 10);
    if (actionDate) talliesByDate.set(actionDate, tally);
    for (const c of action.committees ?? []) {
      const name = c.name?.trim();
      if (name) talliesByCommittee.set(name.toLowerCase(), tally);
    }
  }

  const out: UpsertCommitteeEventParams[] = [];
  let seq = 0;

  for (const committee of params.committees) {
    const systemCode = committee.systemCode?.trim();
    const name = committee.name?.trim();
    const chamber = asFeedChamber(committee.chamber) as FeedChamber | null;
    if (!systemCode || !name || !chamber) continue;

    for (const activity of committee.activities ?? []) {
      const raw = activity.name?.trim() || "Unknown";
      const key = normalizeCommitteeActivity(raw);
      if (key === "interest" || key === "other") continue;
      const at = activityAtOrFallback(activity.date, seq++);
      out.push({
        congress: params.congress,
        billType: params.billType,
        billNumber: params.billNumber,
        systemCode,
        activityKey: key,
        activityAt: at,
        chamber,
        committeeName: name,
        parentSystemCode: null,
        activityRaw: raw,
        tallyText:
          talliesByCommittee.get(name.toLowerCase()) ??
          (key === "advanced" || key === "worked_on"
            ? talliesByDate.get(at.slice(0, 10)) ?? null
            : null),
      });
    }

    for (const sub of committee.subcommittees ?? []) {
      const subCode = sub.systemCode?.trim();
      const subName = sub.name?.trim();
      if (!subCode || !subName) continue;
      for (const activity of sub.activities ?? []) {
        const raw = activity.name?.trim() || "Unknown";
        const key = normalizeCommitteeActivity(raw);
        if (key === "interest" || key === "other") continue;
        const at = activityAtOrFallback(activity.date, seq++);
        out.push({
          congress: params.congress,
          billType: params.billType,
          billNumber: params.billNumber,
          systemCode: subCode,
          activityKey: key,
          activityAt: at,
          chamber,
          committeeName: subName,
          parentSystemCode: systemCode,
          activityRaw: raw,
          tallyText:
            talliesByCommittee.get(subName.toLowerCase()) ??
            (key === "advanced" || key === "worked_on"
              ? talliesByDate.get(at.slice(0, 10)) ?? null
              : null),
        });
      }
    }
  }

  return out;
}
