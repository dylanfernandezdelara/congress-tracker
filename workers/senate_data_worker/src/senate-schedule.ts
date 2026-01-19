/**
 * Senate.gov schedule XML parsing (floor + committee hearings).
 */

import { XMLParser } from "fast-xml-parser";
import { parseVoteDate } from "./date-parse";
import type { CommitteeMeetingItem, FloorScheduleItem } from "./types";

const FLOOR_SCHEDULE_URL =
  "https://www.senate.gov/legislative/schedule/floor_schedule.xml";
const COMMITTEE_SCHEDULE_URL =
  "https://www.senate.gov/general/committee_schedules/hearings.xml";

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  transformTagName: undefined,
  parseTagValue: false,
  trimValues: true,
};

function createParser(): XMLParser {
  return new XMLParser(parserOptions);
}

function getText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]).trim();
  }
  return "";
}

function normalizeDate(raw: string | undefined, fallbackDate: string): string {
  const parsed = parseVoteDate(raw ?? "");
  if (parsed) return parsed;
  const maybe = raw?.trim();
  if (maybe && maybe.length >= 10) {
    return maybe.slice(0, 10);
  }
  return fallbackDate;
}

function parseIsoDateTime(value: string | undefined): { date: string; time?: string } | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, date, hourStr, minStr] = match;
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) {
    return { date };
  }
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return { date, time: `${hour12}:${minStr} ${suffix}` };
}

type UnknownRecord = Record<string, unknown>;

function isObjectArray(value: unknown): value is UnknownRecord[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object");
}

function collectArrays(
  node: unknown,
  preferredKeys: string[],
  arrays: UnknownRecord[][]
): void {
  if (!node) return;
  if (isObjectArray(node)) {
    const hasPreferred = node.some((item) =>
      preferredKeys.some((key) => key in item)
    );
    if (hasPreferred) {
      arrays.push(node);
    }
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node as UnknownRecord)) {
      collectArrays(value, preferredKeys, arrays);
    }
  }
}

function findBestArray(root: unknown, preferredKeys: string[]): UnknownRecord[] {
  const arrays: UnknownRecord[][] = [];
  collectArrays(root, preferredKeys, arrays);
  if (arrays.length === 0) return [];
  return arrays.sort((a, b) => b.length - a.length)[0];
}

export function getFloorScheduleUrl(): string {
  return FLOOR_SCHEDULE_URL;
}

export function getCommitteeScheduleUrl(): string {
  return COMMITTEE_SCHEDULE_URL;
}

export function parseFloorScheduleXml(
  xml: string,
  fallbackDate: string
): FloorScheduleItem[] {
  const parser = createParser();
  const parsed = parser.parse(xml) as UnknownRecord;
  const root = (parsed as UnknownRecord).CongressSessionDayConvenings ?? parsed;
  const legislativeDays = findBestArray(root, ["LegislativeDayDate", "SessionDay"]);

  if (legislativeDays.length > 0) {
    const items: FloorScheduleItem[] = [];
    for (const day of legislativeDays) {
      const dayDate =
        getText(day["@_LegislativeDayDate"]) ||
        getText(day.LegislativeDayDate) ||
        fallbackDate;
      const sessionDays = findBestArray(day, ["ConveneDate", "AdjournDate"]);
      for (const session of sessionDays) {
        const convene = parseIsoDateTime(getText(session.ConveneDate));
        const adjourn = parseIsoDateTime(getText(session.AdjournDate));
        const date = convene?.date ?? normalizeDate(dayDate, fallbackDate);
        const time = convene?.time;
        const summaryParts: string[] = [];
        if (adjourn?.time) {
          summaryParts.push(`Adjourned ${adjourn.time}`);
        }
        const adjournType = getText(session.AdjournType);
        if (adjournType) summaryParts.push(adjournType);
        const nextConvene = parseIsoDateTime(getText(session.NextConveneDate));
        if (nextConvene?.date) {
          summaryParts.push(`Next convene ${nextConvene.date}${nextConvene.time ? ` ${nextConvene.time}` : ""}`);
        }
        items.push({
          source: "senate",
          type: "floor_schedule",
          date,
          time,
          title: "Senate convenes",
          summary: summaryParts.length ? summaryParts.join(" • ") : undefined,
        });
      }
    }
    return items;
  }

  const items = findBestArray(parsed, [
    "item",
    "description",
    "time",
    "meeting_time",
    "schedule_item",
    "title",
  ]);

  return items
    .map((item) => {
      const date = normalizeDate(
        getText(item.date ?? item.meeting_date ?? item.schedule_date),
        fallbackDate
      );
      const time = getText(item.time ?? item.meeting_time ?? item.start_time) || undefined;
      const title =
        getText(item.title ?? item.item ?? item.description ?? item.subject) ||
        "Senate floor schedule";
      const summary = getText(item.summary ?? item.description) || undefined;
      const location = getText(item.location ?? item.room) || undefined;
      const url = getText(item.url ?? item.link) || undefined;
      return {
        source: "senate",
        type: "floor_schedule",
        date,
        time,
        title,
        summary,
        location,
        url,
      } as FloorScheduleItem;
    })
    .filter((item) => item.title);
}

export function parseCommitteeScheduleXml(
  xml: string,
  fallbackDate: string
): CommitteeMeetingItem[] {
  const parser = createParser();
  const parsed = parser.parse(xml) as UnknownRecord;
  const items = findBestArray(parsed, [
    "committee",
    "committee_name",
    "subject",
    "meeting_date",
    "hearing_title",
    "date_iso_8601",
    "matter",
  ]);

  return items
    .map((item) => {
      const date = normalizeDate(
        getText(item.date_iso_8601 ?? item.meeting_date ?? item.date),
        fallbackDate
      );
      const time = getText(item.time ?? item.meeting_time ?? item.start_time) || undefined;
      const committee =
        getText(item.committee ?? item.committee_name ?? item.committee_name_short) ||
        "Senate Committee";
      const subcommittee = getText(item.sub_cmte ?? item.subcommittee ?? item.subcommittee_name) || undefined;
      const title =
        getText(item.matter ?? item.title ?? item.subject ?? item.hearing_title ?? item.meeting) ||
        "Committee meeting";
      const location = getText(item.location ?? item.room) || undefined;
      const url = getText(item.url ?? item.link) || undefined;
      return {
        source: "senate",
        type: "committee_meeting",
        date,
        time,
        committee,
        subcommittee,
        title,
        location,
        url,
      } as CommitteeMeetingItem;
    })
    .filter((item) => item.title);
}
