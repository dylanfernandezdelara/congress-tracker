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

interface CongressNomineePosition {
  organization?: string;
  positionTitle?: string;
  introText?: string;
  nominees?: { item?: CongressNominee[] | CongressNominee };
}

interface CongressNominationDetail {
  nomination?: {
    number?: number;
    partNumber?: number;
    citation?: string;
    description?: string;
    receivedDate?: string;
    organization?: string;
    nominees?: { item?: CongressNomineePosition[] | CongressNomineePosition };
  };
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

function collectNominees(
  positions: CongressNomineePosition[]
): {
  nominees: ConfirmationNominee[];
  organization: string | null;
  positionTitle: string | null;
  introText: string | null;
} {
  const nominees: ConfirmationNominee[] = [];
  let organization: string | null = null;
  let positionTitle: string | null = null;
  let introText: string | null = null;

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
    for (const nominee of asArray(position.nominees?.item)) {
      const displayName = formatNomineeName(nominee);
      if (!displayName) continue;
      nominees.push({
        display_name: displayName,
        state: nominee.state?.trim() || null,
      });
    }
  }

  return { nominees, organization, positionTitle, introText };
}

export function buildRawBackgroundText(params: {
  description: string | null;
  organization: string | null;
  positionTitle: string | null;
  introText: string | null;
  nominees: ConfirmationNominee[];
  wikipediaExtract?: string | null;
}): string | null {
  const lines: string[] = [];
  if (params.description?.trim()) lines.push(params.description.trim());
  if (params.introText?.trim()) lines.push(params.introText.trim());
  if (params.wikipediaExtract?.trim()) {
    lines.push(`Biography: ${params.wikipediaExtract.trim()}`);
  }
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

/** Pure parse of a Congress.gov nomination detail payload (testable). */
export function parseNominationDetail(data: CongressNominationDetail): NominationBundle {
  const nomination = data.nomination;
  const description = nomination?.description?.trim() || null;
  const positions = asArray(nomination?.nominees?.item);
  const { nominees, organization, positionTitle, introText } = collectNominees(positions);
  const org = organization ?? nomination?.organization?.trim() ?? null;
  const receivedDate = nomination?.receivedDate?.slice(0, 10) || null;
  const rawBackgroundText = buildRawBackgroundText({
    description,
    organization: org,
    positionTitle,
    introText,
    nominees,
  });

  return {
    description,
    organization: org,
    positionTitle,
    introText,
    nominees,
    receivedDate,
    rawBackgroundText,
  };
}

export async function fetchNominationBundle(
  env: Env,
  ref: NominationRef
): Promise<NominationBundle> {
  const apiKey = env.CONGRESS_API_KEY;
  const numberPath = nominationApiNumber(ref);
  const url = `https://api.congress.gov/v3/nomination/${ref.congress}/${numberPath}?format=json&api_key=${apiKey}`;
  const data = await fetchJson<CongressNominationDetail>(url);
  return parseNominationDetail(data);
}

export function congressGovNominationUrl(ref: NominationRef): string {
  const base = `https://www.congress.gov/nomination/${congressOrdinal(ref.congress)}-congress/${ref.number}`;
  return ref.partNumber > 0 ? `${base}/${ref.partNumber}` : base;
}
