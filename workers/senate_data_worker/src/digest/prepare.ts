import type { Env } from "../config";
import { billPathSegment, fetchBillTextXml, usableTextVersions, type TextVersionItem } from "../sources/bill-text";
import { fetchAllBillActions, fetchBillSummaryBundle, type BillSummaryBundle } from "../sources/congress-client";
import { fetchJson } from "../sources/http";
import type { BillRef } from "../types";
import {
  approxTokens,
  billBodyXml,
  billXmlToText,
  SINGLE_PASS_MAX_TOKENS,
  splitBillParts,
  type BillTextPart,
} from "./bill-text-parse";
import type { CheckableSources } from "./checks";
import { billFactsFromActions } from "./bill-facts";
import { PROMPT_EPOCH, statusLabel, votesLine, type DigestBillInput } from "./prompt";

/** Everything a summary is written from, for one bill. */
export interface PreparedBill {
  ref: BillRef;
  input: DigestBillInput;
  /** The bill split into its own parts when it is too long for one pass; otherwise empty. */
  parts: BillTextPart[];
  totalTokens: number;
  /** What the summary can be written from. */
  basis: "text" | "crs" | "title_only";
  /** Sources as the pre-store checks read them. */
  checkSources: CheckableSources;
  /** Hash of the inputs; an unchanged fingerprint means there is nothing new to summarize. */
  fingerprint: string;
  bundle: BillSummaryBundle;
}

interface CommitteesResponse {
  committees?: Array<{ name?: string }>;
}
interface TextVersionsResponse {
  textVersions?: TextVersionItem[];
}

/** FNV-1a 32-bit: short and stable, no crypto needed. */
export function fingerprintOf(parts: unknown[]): string {
  const input = JSON.stringify(parts);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Gather a bill's sources, all from Congress.gov: detail (with its law list), CRS summary, committees, every action,
 * and the newest text. Status and floor votes come from the bill's own actions, so they are complete however long ago
 * the bill moved; nothing is read from the site's own vote or lifecycle tables. Long text is split into parts along
 * the bill's own structure.
 */
export async function prepareBill(env: Env, ref: BillRef): Promise<PreparedBill> {
  const base = `https://api.congress.gov/v3/bill/${ref.congress}/${billPathSegment(ref.type)}/${ref.number}`;
  const key = env.CONGRESS_API_KEY;
  const [bundle, committees, versions, actions] = await Promise.all([
    fetchBillSummaryBundle(env, ref),
    fetchJson<CommitteesResponse>(`${base}/committees?format=json&api_key=${key}`).catch(() => ({ committees: [] })),
    // No catch: a failed text lookup would look like "no text yet", change the fingerprint, and pay for a worse
    // summary over a text-based one. The sweep re-queues the bill instead.
    fetchJson<TextVersionsResponse>(`${base}/text?format=json&limit=250&api_key=${key}`),
    fetchAllBillActions(env, ref),
  ]);
  const versionItems = versions.textVersions ?? [];
  const usable = usableTextVersions(versionItems);
  // Newest printed version; the public-law print duplicates the enrolled bill, so prefer the bill itself.
  const latest = [...usable].reverse().find((v) => !/^Public Law/i.test(v.type)) ?? usable.at(-1) ?? null;

  let text: string | null = null;
  let parts: BillTextPart[] = [];
  if (latest) {
    const xml = await fetchBillTextXml(latest.xmlUrl);
    if (xml) {
      const body = billBodyXml(xml);
      text = billXmlToText(body);
      if (approxTokens(text) > SINGLE_PASS_MAX_TOKENS) parts = splitBillParts(body);
    }
  }

  const facts = billFactsFromActions(ref, actions, bundle.laws);
  const votes = facts.votes;
  const sponsor = bundle.sponsors.find((s) => s.isPrimary) ?? bundle.sponsors[0] ?? null;
  const input: DigestBillInput = {
    congress: ref.congress,
    type: ref.type.toUpperCase(),
    number: ref.number,
    title: bundle.title,
    sponsorName: sponsor?.fullName ?? null,
    status: facts.status,
    committees: (committees.committees ?? []).map((c) => c.name ?? "").filter(Boolean),
    policyArea: bundle.policyArea,
    votes,
    crs: bundle.rawSummaryText ? { version: bundle.rawSummaryVersion ?? null, text: bundle.rawSummaryText } : null,
    textVersion: text && latest ? { type: latest.type, date: latest.date } : null,
    // A split bill is read part by part; the single-pass prompt never sees its whole text.
    text: parts.length ? null : text,
  };
  const basis = text ? "text" : input.crs ? "crs" : "title_only";
  return {
    ref,
    input,
    parts,
    totalTokens: text ? approxTokens(text) : 0,
    basis,
    checkSources: { type: input.type, title: input.title, crsText: input.crs?.text ?? null, text, statusLabel: statusLabel(input), votesText: votesLine(input) },
    fingerprint: fingerprintOf([
      PROMPT_EPOCH,
      input.textVersion ? `${input.textVersion.type}|${input.textVersion.date}` : null,
      input.crs ? fingerprintOf([input.crs.text]) : null,
      votes.map((v) => `${v.chamber}|${v.vote_date}|${v.result}|${v.yeas}|${v.nays}|${v.how}`),
      input.status.stage,
      input.title,
    ]),
    bundle,
  };
}
