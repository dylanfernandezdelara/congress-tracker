import { formatBillQueryParam } from "../../../../shared/bill-id";
import type {
  MemberProfileRecentCrossVote,
  MemberProfileSponsoredBill,
} from "../../../../shared/stats-api-types";
import { normalizeBillType } from "../sources/bill-type";
import { feedMembershipCteSql, feedMembershipWindowBinds } from "./feed-membership";
import type { MemberCrossVoteCore } from "./member-session-stats";
import { ensureSchema } from "./schema";

const SPONSORED_BILL_LIMIT = 5;

function profileBillId(congress: number, billType: string, billNumber: number): string {
  return formatBillQueryParam({
    congress,
    type: normalizeBillType(billType),
    number: billNumber,
  });
}

function rollLookupKey(
  chamber: string,
  congress: number,
  session: number,
  rollNumber: number
): string {
  return `${chamber}:${congress}:${session}:${rollNumber}`;
}

function asText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value: string | null | undefined): string | null {
  const text = asText(value);
  return text.length > 0 ? text : null;
}

export type ProfileBillKey = {
  congress: number;
  billType: string;
  billNumber: number;
};

function billKeyId(bill: ProfileBillKey): string {
  return profileBillId(bill.congress, bill.billType, bill.billNumber);
}

function uniqueBillKeys(bills: ProfileBillKey[]): ProfileBillKey[] {
  const seen = new Set<string>();
  const unique: ProfileBillKey[] = [];
  for (const bill of bills) {
    const key = billKeyId(bill);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      billNumber: bill.billNumber,
    });
  }
  return unique;
}

type CrossVoteBillRow = {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  title: string | null;
  headline: string | null;
};

function withEmptyBillFields(vote: MemberCrossVoteCore): MemberProfileRecentCrossVote {
  return {
    ...vote,
    bill_id: profileBillId(vote.bill_congress, vote.bill_type, vote.bill_number),
    title: "",
    headline: null,
    in_feed: false,
  };
}

/** Batched roll + digest join for ≤5 recent cross-votes. */
export function enrichRecentCrossVotesSql(rollCount: number): string {
  const clauses = Array.from(
    { length: rollCount },
    () => "(v.chamber = ? AND v.congress = ? AND v.session = ? AND v.roll_number = ?)"
  ).join(" OR ");
  return `SELECT v.chamber, v.congress, v.session, v.roll_number,
              d.title,
              json_extract(d.digest_json, '$.headline') AS headline
       FROM votes v
       LEFT JOIN bill_digests d
         ON d.congress = v.bill_congress
        AND UPPER(d.bill_type) = UPPER(v.bill_type)
        AND d.number = v.bill_number
       WHERE ${clauses}`;
}

export function sponsoredBillsCountSql(): string {
  return `SELECT COUNT(*) AS total
       FROM bill_sponsors
       WHERE bioguide_id = ? AND congress = ? AND is_primary = 1`;
}

export function sponsoredBillsSelectSql(): string {
  return `SELECT s.congress, s.bill_type, s.bill_number,
              d.title,
              json_extract(d.digest_json, '$.headline') AS headline,
              d.policy_area,
              l.introduced_date,
              l.latest_action_text
       FROM bill_sponsors s
       LEFT JOIN bill_digests d
         ON d.congress = s.congress
        AND UPPER(d.bill_type) = UPPER(s.bill_type)
        AND d.number = s.bill_number
       LEFT JOIN bill_lifecycle l
         ON l.congress = s.congress
        AND UPPER(l.bill_type) = UPPER(s.bill_type)
        AND l.bill_number = s.bill_number
       WHERE s.bioguide_id = ? AND s.congress = ? AND s.is_primary = 1
       ORDER BY COALESCE(l.introduced_date, s.updated_at) DESC, s.bill_number DESC
       LIMIT ?`;
}

export function inFeedBillKeysSql(candidateCount: number): string {
  const clauses = Array.from(
    { length: candidateCount },
    () => "(bill_congress = ? AND bill_type = ? AND bill_number = ?)"
  ).join(" OR ");
  return `${feedMembershipCteSql(true)}
    SELECT DISTINCT bill_congress, bill_type, bill_number
    FROM combined
    WHERE ${clauses}`;
}

/**
 * Attach title/headline to ≤5 recent cross-votes in one join.
 * Missing digest rows leave title empty and headline null; `bill_id` always
 * comes from the roll's stored bill key. `in_feed` is filled later.
 */
export async function enrichRecentCrossVotes(
  db: D1Database,
  votes: MemberCrossVoteCore[]
): Promise<MemberProfileRecentCrossVote[]> {
  if (votes.length === 0) return [];

  await ensureSchema(db);
  const binds: Array<string | number> = [];
  for (const vote of votes) {
    binds.push(vote.chamber, vote.congress, vote.session, vote.roll_number);
  }

  const { results } = await db
    .prepare(enrichRecentCrossVotesSql(votes.length))
    .bind(...binds)
    .all<CrossVoteBillRow>();

  const byRoll = new Map<string, CrossVoteBillRow>();
  for (const row of results ?? []) {
    byRoll.set(rollLookupKey(row.chamber, row.congress, row.session, row.roll_number), row);
  }

  return votes.map((vote) => {
    const info = byRoll.get(
      rollLookupKey(vote.chamber, vote.congress, vote.session, vote.roll_number)
    );
    return {
      ...withEmptyBillFields(vote),
      title: asText(info?.title),
      headline: asNullableText(info?.headline),
    };
  });
}

type SponsoredBillRow = {
  congress: number;
  bill_type: string;
  bill_number: number;
  title: string | null;
  headline: string | null;
  policy_area: string | null;
  introduced_date: string | null;
  latest_action_text: string | null;
};

export async function selectSponsoredBillsForMember(
  db: D1Database,
  congress: number,
  bioguideId: string,
  limit = SPONSORED_BILL_LIMIT
): Promise<{ bills: MemberProfileSponsoredBill[]; total: number }> {
  await ensureSchema(db);

  const countRow = await db
    .prepare(sponsoredBillsCountSql())
    .bind(bioguideId, congress)
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);

  if (total === 0 || limit <= 0) {
    return { bills: [], total };
  }

  const { results } = await db
    .prepare(sponsoredBillsSelectSql())
    .bind(bioguideId, congress, limit)
    .all<SponsoredBillRow>();

  const bills = (results ?? []).map((row) => ({
    bill_id: profileBillId(row.congress, row.bill_type, row.bill_number),
    congress: row.congress,
    bill_type: normalizeBillType(row.bill_type),
    bill_number: row.bill_number,
    title: asText(row.title),
    headline: asNullableText(row.headline),
    introduced_date: asNullableText(row.introduced_date),
    policy_area: asNullableText(row.policy_area),
    latest_action_text: asNullableText(row.latest_action_text),
    in_feed: false,
  }));

  return { bills, total };
}

type InFeedBillRow = {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
};

/**
 * One feed-membership lookup for the ≤10 profile candidate bills.
 * Reuses the feed CTE so lookback windows cannot drift.
 */
export async function selectInFeedBillIds(
  db: D1Database,
  bills: ProfileBillKey[],
  asOf: Date = new Date()
): Promise<Set<string>> {
  const unique = uniqueBillKeys(bills);
  if (unique.length === 0) return new Set();

  await ensureSchema(db);
  const binds: Array<string | number> = [
    ...feedMembershipWindowBinds(asOf, true),
    ...unique.flatMap((bill) => [bill.congress, bill.billType, bill.billNumber]),
  ];

  const { results } = await db
    .prepare(inFeedBillKeysSql(unique.length))
    .bind(...binds)
    .all<InFeedBillRow>();

  const ids = new Set<string>();
  for (const row of results ?? []) {
    if (!row.bill_type || row.bill_congress == null || row.bill_number == null) continue;
    ids.add(profileBillId(row.bill_congress, row.bill_type, row.bill_number));
  }
  return ids;
}
