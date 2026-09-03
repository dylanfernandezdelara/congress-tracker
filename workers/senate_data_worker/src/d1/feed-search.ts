import { FEED_SEARCH_MAX_LENGTH } from "../constants";
import {
  partySqlAliases,
  type FeedChamberFilter,
  type FeedPartyFilter,
} from "../../../../shared/feed-filter-params";

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
  /**
   * Passage-vote chamber, or originating chamber for intro-only bills
   * (no passage votes yet).
   */
  chamber?: FeedChamberFilter | string;
  q?: string;
  /** Two-letter primary-sponsor state code. */
  state?: string;
  /** Chamber of the primary sponsor (via members join). */
  sponsorChamber?: FeedChamberFilter;
  /** Exact primary-sponsor bioguide (or LOCAL seed id). */
  sponsor?: string;
  /** Case-insensitive substring on sponsor / member name. */
  sponsorQ?: string;
  /** Primary-sponsor party (D/R/I). */
  party?: FeedPartyFilter;
  /** Exact digest policy_area. */
  policy?: string;
};

/**
 * WHERE clause fragments for selectFeedBills / countFeedBills.
 * Filters combine with AND. Sponsor facets share one EXISTS so they apply to
 * the same primary sponsor. Bills without digests still match on bill id for `q`.
 */
export function buildFeedFilterClause(options: FeedFilterOptions = {}): {
  sql: string;
  binds: Array<string | number>;
} {
  const clauses: string[] = [];
  const binds: Array<string | number> = [];

  if (options.chamber) {
    const originTypes =
      options.chamber === "House"
        ? "('HR','HRES','HJRES','HCONRES')"
        : "('S','SRES','SJRES','SCONRES')";
    // Passage-vote chamber, or intro-only bills that originated in that chamber.
    clauses.push(`(
         EXISTS (
           SELECT 1 FROM votes v
           WHERE v.is_passage = 1
             AND v.chamber = ?
             AND v.bill_congress = combined.bill_congress
             AND UPPER(v.bill_type) = combined.bill_type
             AND v.bill_number = combined.bill_number
         )
         OR (
           combined.bill_type IN ${originTypes}
           AND NOT EXISTS (
             SELECT 1 FROM votes v2
             WHERE v2.is_passage = 1
               AND v2.bill_congress = combined.bill_congress
               AND UPPER(v2.bill_type) = combined.bill_type
               AND v2.bill_number = combined.bill_number
           )
         )
       )`);
    binds.push(options.chamber);
  }

  const sponsorConditions: string[] = [];
  const sponsorBinds: Array<string | number> = [];
  let needsMemberJoin = false;

  if (options.state) {
    sponsorConditions.push("s.state = ?");
    sponsorBinds.push(options.state);
  }

  if (options.sponsorChamber) {
    needsMemberJoin = true;
    sponsorConditions.push("m.chamber = ?");
    sponsorBinds.push(options.sponsorChamber);
  }

  if (options.sponsor) {
    sponsorConditions.push("s.bioguide_id = ?");
    sponsorBinds.push(options.sponsor);
  }

  if (options.sponsorQ) {
    needsMemberJoin = true;
    const substring = `%${escapeLikePattern(options.sponsorQ.toLowerCase())}%`;
    sponsorConditions.push(`(
            (s.full_name IS NOT NULL AND LOWER(s.full_name) LIKE ? ESCAPE '\\')
            OR (m.name IS NOT NULL AND LOWER(m.name) LIKE ? ESCAPE '\\')
          )`);
    sponsorBinds.push(substring, substring);
  }

  if (options.party) {
    needsMemberJoin = true;
    const aliases = partySqlAliases(options.party);
    const placeholders = aliases.map(() => "?").join(", ");
    sponsorConditions.push(
      `UPPER(TRIM(COALESCE(NULLIF(m.party, ''), s.party, ''))) IN (${placeholders})`
    );
    sponsorBinds.push(...aliases);
  }

  if (sponsorConditions.length > 0) {
    const joinSql = needsMemberJoin
      ? "LEFT JOIN members m ON m.bioguide_id = s.bioguide_id"
      : "";
    clauses.push(`EXISTS (
         SELECT 1 FROM bill_sponsors s
         ${joinSql}
         WHERE s.is_primary = 1
           AND s.congress = combined.bill_congress
           AND UPPER(s.bill_type) = combined.bill_type
           AND s.bill_number = combined.bill_number
           AND ${sponsorConditions.join("\n           AND ")}
       )`);
    binds.push(...sponsorBinds);
  }

  if (options.policy) {
    clauses.push(`EXISTS (
         SELECT 1 FROM bill_digests d
         WHERE d.congress = combined.bill_congress
           AND UPPER(d.bill_type) = combined.bill_type
           AND d.number = combined.bill_number
           AND d.policy_area = ?
       )`);
    binds.push(options.policy);
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
