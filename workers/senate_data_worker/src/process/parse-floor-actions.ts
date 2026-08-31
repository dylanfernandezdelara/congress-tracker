import { parseIsoDay } from "../../../../shared/iso-day";
import {
  formatFloorActionLabel,
  type BillFloorActionKey,
} from "../../../../shared/bill-process-labels";
import type { FeedChamber } from "../../../../shared/feed-api-types";
import type { CongressAction } from "../lifecycle/parse-actions";
import type { ProcessFloorEvent } from "./types";

const SKIP_TEXT =
  /introduced in (the )?(house|senate)|passed\/agreed to in|presented to president|(?<!un)signed by president|became public law|vetoed by president|motion to reconsider|sponsor introductory remarks|public law unsigned|sent to archivist/i;

const COMMITTEE_ONLY =
  /^(referred to the (house|senate) committee|committee (hearings|consideration|markup)|ordered to be reported|reported (to|by)|discharged from)/i;

const CALENDAR_TEXT = /placed on .{0,40}calendar/i;
const RECEIVED_TEXT = /received in the (house|senate)|message on senate action received in house/i;

/** House Clerk / LIS codes. LOC 1000 is "Introduced in House", not received. */
const HOUSE_RECEIVED_CODES = new Set(["H14000"]);
const HOUSE_CALENDAR_CODES = new Set(["H12410"]);

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
  const source = action.sourceSystem?.name?.toLowerCase() ?? "";
  if (source.includes("senate")) return "Senate";
  if (source.includes("house")) return "House";
  const lower = text.toLowerCase();
  const hasSenate = /\bsenate\b/.test(lower);
  const hasHouse = /\bhouse\b/.test(lower);
  if (hasSenate && !hasHouse) return "Senate";
  if (hasHouse && !hasSenate) return "House";
  if (/union calendar|house calendar|private calendar|corrections calendar/i.test(text)) {
    return "House";
  }
  if (/legislative calendar/i.test(text)) return "Senate";
  if (/suspension of the rules/i.test(text)) return "House";
  if (/h\.\s*rept/i.test(text)) return "House";
  if (/s\.\s*rept/i.test(text)) return "Senate";
  return null;
}

function shouldSkip(text: string, type: string): boolean {
  if (!text) return true;
  if (SKIP_TEXT.test(text)) return true;
  if (CALENDAR_TEXT.test(text) || RECEIVED_TEXT.test(text)) return false;
  if (COMMITTEE_ONLY.test(text)) return true;
  if (type === "committee") return true;
  if (type === "president" || type === "becominglaw") return true;
  if (type === "introreferral" && /referred/i.test(text)) return true;
  return false;
}

type FloorRule = {
  key: BillFloorActionKey;
  chamber?: FeedChamber;
  match: (params: { text: string; type: string; code: string }) => boolean;
};

const FLOOR_RULES: FloorRule[] = [
  {
    key: "received",
    chamber: "Senate",
    match: ({ text }) => /received in the senate/i.test(text),
  },
  {
    key: "received",
    chamber: "House",
    match: ({ text, code }) =>
      HOUSE_RECEIVED_CODES.has(code) ||
      /received in the house/i.test(text) ||
      /message on senate action received in house/i.test(text),
  },
  {
    key: "cloture",
    chamber: "Senate",
    match: ({ text }) => /cloture/i.test(text),
  },
  {
    key: "conference",
    match: ({ text }) => /conference/i.test(text),
  },
  {
    key: "calendar",
    match: ({ text, type, code }) =>
      HOUSE_CALENDAR_CODES.has(code) || CALENDAR_TEXT.test(text) || type === "calendars",
  },
  {
    key: "considered",
    match: ({ text, type }) =>
      /considered as unfinished business/i.test(text) ||
      /measure laid before/i.test(text) ||
      /considered under (the )?(suspension|unanimous)/i.test(text) ||
      (type === "floor" && /debated|considered/i.test(text)),
  },
];

function classify(
  action: CongressAction,
  text: string,
  type: string,
  code: string
): { key: BillFloorActionKey; chamber: FeedChamber } | null {
  if (shouldSkip(text, type)) return null;

  for (const rule of FLOOR_RULES) {
    if (!rule.match({ text, type, code })) continue;
    const chamber = rule.chamber ?? inferChamber(action, text);
    if (!chamber) return null;
    return { key: rule.key, chamber };
  }
  return null;
}

const MAX_FLOOR_EVENTS = 24;

function capFloorEvents(events: ProcessFloorEvent[]): ProcessFloorEvent[] {
  const considered = events.filter((e) => e.actionKey === "considered");
  const rest = events.filter((e) => e.actionKey !== "considered");
  const consideredKeep: ProcessFloorEvent[] = [];
  const byChamber = new Map<FeedChamber, ProcessFloorEvent[]>();
  for (const event of considered) {
    const list = byChamber.get(event.chamber) ?? [];
    list.push(event);
    byChamber.set(event.chamber, list);
  }
  for (const list of byChamber.values()) {
    const first = list[0];
    const last = list[list.length - 1];
    if (first) consideredKeep.push(first);
    if (last && last !== first) consideredKeep.push(last);
  }
  const combined = [...rest, ...consideredKeep].sort((a, b) =>
    a.actionAt.localeCompare(b.actionAt)
  );
  if (combined.length <= MAX_FLOOR_EVENTS) return combined;
  if (rest.length >= MAX_FLOOR_EVENTS) return rest.slice(-MAX_FLOOR_EVENTS);
  return combined.slice(-MAX_FLOOR_EVENTS);
}

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
    const da = parseIsoDay(a.actionDate) ?? "";
    const db = parseIsoDay(b.actionDate) ?? "";
    return da.localeCompare(db);
  });

  for (const action of sorted) {
    const text = actionText(action);
    const date = parseIsoDay(action.actionDate);
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
  }

  return capFloorEvents(out);
}
