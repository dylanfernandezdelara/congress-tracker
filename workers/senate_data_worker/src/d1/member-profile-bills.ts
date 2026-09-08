import { formatBillQueryParam } from "../../../../shared/bill-id";
import type {
  MemberProfileRecentCrossVote,
  MemberProfileSponsoredBill,
} from "../../../../shared/stats-api-types";
import { normalizeBillType } from "../sources/bill-type";
import { ensureSchema } from "./schema";

const SPONSORED_BILL_LIMIT = 5;

export function profileBillId(congress: number, billType: string, billNumber: number): string {
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

type CrossVoteBillRow = {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  question: string | null;
  result: string | null;
  title: string | null;
  headline: string | null;
};

function withEmptyBillFields(
  vote: Omit<MemberProfileRecentCrossVote, "bill_id" | "title" | "headline" | "question" | "result">
): MemberProfileRecentCrossVote {
  return {
    ...vote,
    bill_id: profileBillId(vote.bill_congress, vote.bill_type, vote.bill_number),
    title: "",
    headline: null,
    question: null,
    result: null,
  };
}

/**
 * Attach title/headline/question/result to ≤5 recent cross-votes in one join.
 * Missing digest or vote rows leave those fields empty/null; `bill_id` always
 * comes from the roll's stored bill key.
 */
export async function enrichRecentCrossVotes(
  db: D1Database,
  votes: Array<
    Omit<MemberProfileRecentCrossVote, "bill_id" | "title" | "headline" | "question" | "result">
  >
): Promise<MemberProfileRecentCrossVote[]> {
  if (votes.length === 0) return [];

  await ensureSchema(db);
  const clauses = votes
    .map(() => "(v.chamber = ? AND v.congress = ? AND v.session = ? AND v.roll_number = ?)")
    .join(" OR ");
  const binds: Array<string | number> = [];
  for (const vote of votes) {
    binds.push(vote.chamber, vote.congress, vote.session, vote.roll_number);
  }

  const { results } = await db
    .prepare(
      `SELECT v.chamber, v.congress, v.session, v.roll_number,
              v.question, v.result,
              d.title,
              json_extract(d.digest_json, '$.headline') AS headline
       FROM votes v
       LEFT JOIN bill_digests d
         ON d.congress = v.bill_congress
        AND UPPER(d.bill_type) = UPPER(v.bill_type)
        AND d.number = v.bill_number
       WHERE ${clauses}`
    )
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
      question: asNullableText(info?.question),
      result: asNullableText(info?.result),
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
  status: string | null;
};

export async function selectSponsoredBillsForMember(
  db: D1Database,
  congress: number,
  bioguideId: string,
  limit = SPONSORED_BILL_LIMIT
): Promise<{ bills: MemberProfileSponsoredBill[]; total: number }> {
  await ensureSchema(db);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM bill_sponsors
       WHERE bioguide_id = ? AND congress = ? AND is_primary = 1`
    )
    .bind(bioguideId, congress)
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);

  if (total === 0 || limit <= 0) {
    return { bills: [], total };
  }

  const { results } = await db
    .prepare(
      `SELECT s.congress, s.bill_type, s.bill_number,
              d.title,
              json_extract(d.digest_json, '$.headline') AS headline,
              d.policy_area,
              l.introduced_date,
              l.latest_action_text AS status
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
       LIMIT ?`
    )
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
    status: asNullableText(row.status),
  }));

  return { bills, total };
}
