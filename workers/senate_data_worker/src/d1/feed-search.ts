import { FEED_SEARCH_MAX_LENGTH } from "../constants";

/** Escape `\`, `%`, and `_` so LIKE matches them literally under ESCAPE '\'. */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Normalize a feed `q` query: trim, treat empty as omitted, silently truncate.
 */
export function normalizeFeedSearchQuery(
  raw: string | null | undefined
): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  return trimmed.length > FEED_SEARCH_MAX_LENGTH
    ? trimmed.slice(0, FEED_SEARCH_MAX_LENGTH)
    : trimmed;
}

/** Alphanumeric-only form used for bill id prefix matching (hr1, H.R. 1 → hr1). */
export function stripBillIdQuery(q: string): string {
  return q.replace(/[^a-zA-Z0-9]/g, "");
}

export type FeedFilterOptions = {
  chamber?: string;
  q?: string;
  /** Two-letter sponsor state code (primary sponsors only). */
  state?: string;
};

/**
 * WHERE clause fragments for selectFeedBills / countFeedBills.
 * Chamber, q, and state combine with AND. Bills without digests still match on bill id.
 */
export function buildFeedFilterClause(options: FeedFilterOptions = {}): {
  sql: string;
  binds: Array<string | number>;
} {
  const clauses: string[] = [];
  const binds: Array<string | number> = [];

  if (options.chamber) {
    clauses.push(`EXISTS (
         SELECT 1 FROM votes v
         WHERE v.is_passage = 1
           AND v.chamber = ?
           AND v.bill_congress = combined.bill_congress
           AND UPPER(v.bill_type) = combined.bill_type
           AND v.bill_number = combined.bill_number
       )`);
    binds.push(options.chamber);
  }

  if (options.state) {
    clauses.push(`EXISTS (
         SELECT 1 FROM bill_sponsors s
         WHERE s.is_primary = 1
           AND s.state = ?
           AND s.congress = combined.bill_congress
           AND UPPER(s.bill_type) = combined.bill_type
           AND s.bill_number = combined.bill_number
       )`);
    binds.push(options.state);
  }

  const q = options.q;
  if (q) {
    const substring = `%${escapeLikePattern(q.toLowerCase())}%`;
    const stripped = stripBillIdQuery(q).toLowerCase();
    const digestMatch = `(
            (d.title IS NOT NULL AND LOWER(d.title) LIKE ? ESCAPE '\\')
            OR (d.policy_area IS NOT NULL AND LOWER(d.policy_area) LIKE ? ESCAPE '\\')
            OR (
              d.digest_json IS NOT NULL
              AND json_valid(d.digest_json) = 1
              AND LOWER(COALESCE(
                json_extract(
                  CASE WHEN json_valid(d.digest_json) = 1 THEN d.digest_json END,
                  '$.headline'
                ),
                ''
              )) LIKE ? ESCAPE '\\'
            )
          )`;
    const digestExists = `EXISTS (
         SELECT 1 FROM bill_digests d
         WHERE d.congress = combined.bill_congress
           AND UPPER(d.bill_type) = combined.bill_type
           AND d.number = combined.bill_number
           AND ${digestMatch}
       )`;

    if (stripped.length > 0) {
      clauses.push(`(${digestExists}
       OR LOWER(combined.bill_type || CAST(combined.bill_number AS TEXT)) LIKE ? ESCAPE '\\')`);
      binds.push(substring, substring, substring, `${escapeLikePattern(stripped)}%`);
    } else {
      clauses.push(digestExists);
      binds.push(substring, substring, substring);
    }
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    binds,
  };
}
