import { congressOrdinal } from "../../../../shared/bill-id";
import type { ConfirmationNominee } from "../../../../shared/confirmations-api-types";
import type { Env } from "../config";
import {
  nominationApiNumber,
  type NominationRef,
} from "./nomination-ref";
import { fetchJson } from "./http";

interface CongressNominee {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  prefix?: string;
  suffix?: string;
  state?: string;
}

/**
 * Congress.gov nomination detail lists position batches under `nominees`:
 * `{ organization, positionTitle, ordinal, url, nomineeCount }`.
 * Person names live at `/nomination/{congress}/{number}/{ordinal}`.
 * Older fixtures may still nest people under `nominees.item`.
 */
interface CongressNomineePosition {
  organization?: string;
  positionTitle?: string;
  introText?: string;
  nomineeCount?: number;
  ordinal?: number;
  url?: string;
  nominees?: { item?: CongressNominee[] | CongressNominee } | CongressNominee[];
}

interface CongressNominationDetail {
  nomination?: {
    number?: number;
    partNumber?: number | string;
    citation?: string;
    description?: string;
    receivedDate?: string;
    organization?: string;
    nominees?: CongressNomineePosition[] | { item?: CongressNomineePosition[] | CongressNomineePosition };
  };
}

interface CongressOrdinalNomineesResponse {
  nominees?: CongressNominee[];
}

export interface NominationBundle {
  description: string | null;
  organization: string | null;
  positionTitle: string | null;
  introText: string | null;
  nominees: ConfirmationNominee[];
  receivedDate: string | null;
  rawBackgroundText: string | null;
}

/** Max ordinal sub-fetches per nomination detail (usually 1). */
const MAX_ORDINAL_FETCHES = 5;

function asArray<T>(value: T[] | T | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatNomineeName(nominee: CongressNominee): string | null {
  const parts = [
    nominee.prefix,
    nominee.firstName,
    nominee.middleName,
    nominee.lastName,
    nominee.suffix,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" ");
}

function nomineeFromPerson(nominee: CongressNominee): ConfirmationNominee | null {
  const displayName = formatNomineeName(nominee);
  if (!displayName) return null;
  return {
    display_name: displayName,
    state: nominee.state?.trim() || null,
  };
}

/** Normalize Congress.gov `nominees` which may be an array or `{ item }`. */
export function normalizeNomineePositions(
  nominees:
    | CongressNomineePosition[]
    | { item?: CongressNomineePosition[] | CongressNomineePosition }
    | undefined
    | null
): CongressNomineePosition[] {
  if (!nominees) return [];
  if (Array.isArray(nominees)) return nominees;
  return asArray(nominees.item);
}

function collectNestedNominees(position: CongressNomineePosition): ConfirmationNominee[] {
  const nested = position.nominees;
  const people = Array.isArray(nested) ? nested : asArray(nested?.item);
  const out: ConfirmationNominee[] = [];
  for (const person of people) {
    const parsed = nomineeFromPerson(person);
    if (parsed) out.push(parsed);
  }
  return out;
}

function collectNominees(positions: CongressNomineePosition[]): {
  nominees: ConfirmationNominee[];
  organization: string | null;
  positionTitle: string | null;
  introText: string | null;
  ordinals: number[];
} {
  const nominees: ConfirmationNominee[] = [];
  let organization: string | null = null;
  let positionTitle: string | null = null;
  let introText: string | null = null;
  const ordinals: number[] = [];

  for (const position of positions) {
    if (!organization && position.organization?.trim()) {
      organization = position.organization.trim();
    }
    if (!positionTitle && position.positionTitle?.trim()) {
      positionTitle = position.positionTitle.trim();
    }
    if (!introText && position.introText?.trim()) {
      introText = position.introText.trim();
    }
    if (typeof position.ordinal === "number" && Number.isFinite(position.ordinal)) {
      ordinals.push(position.ordinal);
    }
    for (const nominee of collectNestedNominees(position)) {
      nominees.push(nominee);
    }
  }

  return { nominees, organization, positionTitle, introText, ordinals };
}

/**
 * Parse Congress.gov nomination description lines like
 * "Jane Doe, of California, to be Secretary of Energy, vice …".
 */
export function parseNominationDescription(description: string | null | undefined): {
  nominees: ConfirmationNominee[];
  positionTitle: string | null;
} | null {
  const text = description?.trim();
  if (!text) return null;
  const match = text.match(
    /^(.+?),\s*of\s+([^,]+),\s*to be\s+(.+?)(?:\s*,\s*vice\b.+)?\.?\s*$/i
  );
  if (!match) return null;
  const name = match[1]?.trim();
  const state = match[2]?.trim() || null;
  const role = match[3]?.trim() || null;
  if (!name || !role) return null;
  return {
    nominees: [{ display_name: name, state }],
    positionTitle: role,
  };
}

export function buildRawBackgroundText(params: {
  description: string | null;
  organization: string | null;
  positionTitle: string | null;
  introText: string | null;
  nominees: ConfirmationNominee[];
}): string | null {
  const lines: string[] = [];
  if (params.description?.trim()) lines.push(params.description.trim());
  if (params.introText?.trim()) lines.push(params.introText.trim());
  if (params.positionTitle?.trim()) {
    const org = params.organization?.trim();
    lines.push(
      org
        ? `Position: ${params.positionTitle.trim()} (${org})`
        : `Position: ${params.positionTitle.trim()}`
    );
  } else if (params.organization?.trim()) {
    lines.push(`Organization: ${params.organization.trim()}`);
  }
  if (params.nominees.length > 0) {
    const names = params.nominees
      .map((n) => (n.state ? `${n.display_name} (${n.state})` : n.display_name))
      .join("; ");
    lines.push(`Nominee(s): ${names}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function withDerivedIdentity(bundle: Omit<NominationBundle, "rawBackgroundText">): NominationBundle {
  const fromDescription = parseNominationDescription(bundle.description);
  const nominees =
    bundle.nominees.length > 0 ? bundle.nominees : (fromDescription?.nominees ?? []);
  const positionTitle =
    bundle.positionTitle?.trim() || fromDescription?.positionTitle || null;
  const organization = bundle.organization;
  const introText = bundle.introText;
  return {
    ...bundle,
    nominees,
    positionTitle,
    rawBackgroundText: buildRawBackgroundText({
      description: bundle.description,
      organization,
      positionTitle,
      introText,
      nominees,
    }),
  };
}

/** Pure parse of a Congress.gov nomination detail payload (testable). */
export function parseNominationDetail(data: CongressNominationDetail): NominationBundle {
  const nomination = data.nomination;
  const description = nomination?.description?.trim() || null;
  const positions = normalizeNomineePositions(nomination?.nominees);
  const { nominees, organization, positionTitle, introText } = collectNominees(positions);
  const org = organization ?? nomination?.organization?.trim() ?? null;
  const receivedDate = nomination?.receivedDate?.slice(0, 10) || null;

  return withDerivedIdentity({
    description,
    organization: org,
    positionTitle,
    introText,
    nominees,
    receivedDate,
  });
}

async function fetchNomineesForOrdinals(
  env: Env,
  ref: NominationRef,
  ordinals: number[]
): Promise<ConfirmationNominee[]> {
  const apiKey = env.CONGRESS_API_KEY;
  const numberPath = nominationApiNumber(ref);
  const out: ConfirmationNominee[] = [];
  const seen = new Set<string>();

  for (const ordinal of ordinals.slice(0, MAX_ORDINAL_FETCHES)) {
    const url = `https://api.congress.gov/v3/nomination/${ref.congress}/${numberPath}/${ordinal}?format=json&api_key=${apiKey}`;
    const data = await fetchJson<CongressOrdinalNomineesResponse>(url);
    for (const person of data.nominees ?? []) {
      const parsed = nomineeFromPerson(person);
      if (!parsed) continue;
      const key = `${parsed.display_name}|${parsed.state ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(parsed);
    }
  }
  return out;
}

export async function fetchNominationBundle(
  env: Env,
  ref: NominationRef
): Promise<NominationBundle> {
  const apiKey = env.CONGRESS_API_KEY;
  const numberPath = nominationApiNumber(ref);
  const url = `https://api.congress.gov/v3/nomination/${ref.congress}/${numberPath}?format=json&api_key=${apiKey}`;
  const data = await fetchJson<CongressNominationDetail>(url);
  const partial = parseNominationDetail(data);

  const positions = normalizeNomineePositions(data.nomination?.nominees);
  const ordinals = positions
    .map((p) => p.ordinal)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  if (partial.nominees.length === 0 && ordinals.length > 0) {
    const nominees = await fetchNomineesForOrdinals(env, ref, ordinals);
    return withDerivedIdentity({
      description: partial.description,
      organization: partial.organization,
      positionTitle: partial.positionTitle,
      introText: partial.introText,
      nominees,
      receivedDate: partial.receivedDate,
    });
  }

  return partial;
}

export function congressGovNominationUrl(ref: NominationRef): string {
  const base = `https://www.congress.gov/nomination/${congressOrdinal(ref.congress)}-congress/${ref.number}`;
  return ref.partNumber > 0 ? `${base}/${ref.partNumber}` : base;
}
