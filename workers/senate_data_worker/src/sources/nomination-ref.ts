/** Parsed presidential nomination reference from a Senate vote_menu issue field. */
export interface NominationRef {
  congress: number;
  /** Nomination number (e.g. 851 from PN851-4). */
  number: number;
  /** Partition number; 0 when the nomination is not partitioned. */
  partNumber: number;
}

const PN_ISSUE = /^PN\s*(\d+)(?:-(\d+))?$/i;

/**
 * Parse Senate vote_menu issue field for presidential nominations
 * (e.g. "PN851-4", "PN100").
 */
export function parseSenateNominationIssue(
  issue: string,
  congress: number
): NominationRef | null {
  const trimmed = issue.trim();
  const m = trimmed.match(PN_ISSUE);
  if (!m) return null;
  const number = Number.parseInt(m[1], 10);
  if (Number.isNaN(number)) return null;
  const partNumber = m[2] ? Number.parseInt(m[2], 10) : 0;
  if (Number.isNaN(partNumber)) return null;
  return { congress, number, partNumber };
}

/** Build citation string (PN851 or PN851-4). */
export function nominationCitation(ref: Pick<NominationRef, "number" | "partNumber">): string {
  if (ref.partNumber > 0) return `PN${ref.number}-${ref.partNumber}`;
  return `PN${ref.number}`;
}

/** Path segment for Congress.gov nomination API. */
export function nominationApiNumber(ref: Pick<NominationRef, "number" | "partNumber">): string {
  if (ref.partNumber > 0) return `${ref.number}-${ref.partNumber}`;
  return String(ref.number);
}
