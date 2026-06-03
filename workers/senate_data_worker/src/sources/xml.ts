/**
 * Single fast-xml-parser configuration shared by every XML source adapter
 * (Senate vote menu/detail XML and the Senate floor/committee schedules).
 * Previously this config + factory was duplicated in `xml.ts` and
 * `senate-schedule.ts`.
 */
import { XMLParser } from "fast-xml-parser";

export const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Keep original tag-name casing.
  transformTagName: undefined,
  // Parse values as strings; numeric coercion is handled explicitly downstream.
  parseTagValue: false,
  trimValues: true,
} as const;

/** Create a parser configured with the shared options. */
export function createXmlParser(): XMLParser {
  return new XMLParser(XML_PARSER_OPTIONS);
}
