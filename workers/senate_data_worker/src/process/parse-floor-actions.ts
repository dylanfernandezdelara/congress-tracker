import {
  formatFloorActionLabel,
  type BillFloorActionKey,
} from "../../../../shared/bill-process-labels";
import type { FeedChamber } from "../../../../shared/feed-api-types";
import type { CongressAction } from "../lifecycle/parse-actions";
import { asFeedChamber } from "../sources/congress-client";
import type { ProcessFloorEvent } from "./types";

const SKIP_TEXT =
  /introduced in (the )?(house|senate)|passed\/agreed to in|presented to president|(?<!un)signed by president|became public law|vetoed by president|motion to reconsider|sponsor introductory remarks|public law unsigned|sent to archivist/i;

const COMMITTEE_ONLY =
  /^(referred to the (house|senate) committee|committee (hearings|consideration|markup)|ordered to be reported|reported (to|by)|discharged from)/i;

function actionDate(action: CongressAction): string | null {
  const raw = action.actionDate?.trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

function actionText(action: CongressAction): string {
  return action.text?.trim() ?? "";
}

function normalizeTally(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/[–—]/g, "-");
}

/** Pull "60 - 37" / voice / UC tallies from floor action text. */
export function extractFloorTally(text: string | null | undefined): string | null {
  if (!text) return null;
  const named = text.match(
    /(?:Yea-Nay Vote|Yeas?\s+and\s+Nays?|yea[\s-]*nay)[^\d]*(\d+\s*[-–—]\s*\d+)/i
  );
  if (named?.[1]) return normalizeTally(named[1]);
  if (/voice vote/i.test(text)) return "voice vote";
  if (/unanimous consent/i.test(text)) return "unanimous consent";
  const clotureTally = text.match(/cloture[^\d]{0,40}(\d+\s*[-–—]\s*\d+)/i);
  if (clotureTally?.[1]) return normalizeTally(clotureTally[1]);
  return null;
}

function inferChamber(action: CongressAction, text: string): FeedChamber | null {
  const lower = text.toLowerCase();
  const source = action.sourceSystem?.name?.toLowerCase() ?? "";
  if (/\bsenate\b/.test(lower) || source.includes("senate")) return "Senate";
  if (/\bhouse\b/.test(lower) || source.includes("house")) return "House";
  if (/union calendar|house calendar|private calendar|corrections calendar/i.test(text)) {
    return "House";
  }
  if (/legislative calendar/i.test(text)) return "Senate";
  if (/suspension of the rules/i.test(text)) return "House";
  if (/h\.\s*rept/i.test(text)) return "House";
  if (/s\.\s*rept/i.test(text)) return "Senate";
  return asFeedChamber(action.type ?? undefined);
}

function shouldSkip(text: string, type: string): boolean {
  if (!text) return true;
  if (SKIP_TEXT.test(text)) return true;
  if (COMMITTEE_ONLY.test(text) && !/received/i.test(text)) return true;
  if (type === "committee") return true;
  if (type === "president" || type === "becominglaw") return true;
  if (type === "introreferral" && /referred/i.test(text) && !/received/i.test(text)) {
    return true;
  }
  return false;
}

function classify(
  action: CongressAction,
  text: string,
  type: string,
  code: string
): { key: BillFloorActionKey; chamber: FeedChamber } | null {
  if (shouldSkip(text, type)) return null;

  if (/received in the senate/i.test(text) || code === "1000") {
    return { key: "received", chamber: "Senate" };
  }
  if (
    /received in the house/i.test(text) ||
    /message on senate action received in house/i.test(text)
  ) {
    return { key: "received", chamber: "House" };
  }

  if (/cloture/i.test(text)) {
    return { key: "cloture", chamber: "Senate" };
  }

  if (/conference/i.test(text) || type === "resolvingdifferences") {
    const chamber = inferChamber(action, text);
    if (!chamber) return null;
    return { key: "conference", chamber };
  }

  if (
    /placed on .{0,40}calendar/i.test(text) ||
    type === "calendars" ||
    code === "5000"
  ) {
    const chamber = inferChamber(action, text);
    if (!chamber) return null;
    return { key: "calendar", chamber };
  }

  if (
    /considered as unfinished business/i.test(text) ||
    /measure laid before/i.test(text) ||
    /considered under (the )?(suspension|unanimous)/i.test(text) ||
    (type === "floor" && /debated|considered/i.test(text))
  ) {
    const chamber = inferChamber(action, text);
    if (!chamber) return null;
    return { key: "considered", chamber };
  }

  return null;
}

const MAX_FLOOR_EVENTS = 24;

/**
 * Map Congress.gov `/actions` into floor/calendar/cloture/conference rows.
 * Skips introduction, committee, passage, and presidential milestones already
 * stored elsewhere.
 */
export function parseFloorActions(params: {
  congress: number;
  billType: string;
  billNumber: number;
  actions: CongressAction[];
}): ProcessFloorEvent[] {
  const seen = new Set<string>();
  const out: ProcessFloorEvent[] = [];

  const sorted = [...params.actions].sort((a, b) => {
    const da = actionDate(a) ?? "";
    const db = actionDate(b) ?? "";
    return da.localeCompare(db);
  });

  for (const action of sorted) {
    const text = actionText(action);
    const date = actionDate(action);
    if (!date) continue;
    const type = (action.type ?? "").trim().toLowerCase();
    const code = action.actionCode == null ? "" : String(action.actionCode);
    const classified = classify(action, text, type, code);
    if (!classified) continue;

    const dedupeKey = `${classified.key}:${date}:${classified.chamber}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const tallyText = extractFloorTally(text);
    out.push({
      congress: params.congress,
      billType: params.billType,
      billNumber: params.billNumber,
      actionKey: classified.key,
      actionAt: `${date}T12:00:00.000Z`,
      chamber: classified.chamber,
      label: formatFloorActionLabel({
        key: classified.key,
        chamber: classified.chamber,
        tallyText,
      }),
      rawText: text,
      tallyText,
    });

    if (out.length >= MAX_FLOOR_EVENTS) break;
  }

  return out;
}
