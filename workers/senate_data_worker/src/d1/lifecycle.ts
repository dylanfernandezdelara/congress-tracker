import type { RecentLawItem } from "../../../../shared/laws-api-types";
import type { BillLawKind } from "../../../../shared/lifecycle-api-types";
import { normalizeBillType } from "../sources/bill-type";
import { ensureSchema } from "./schema";

/** Bill identity for lifecycle refresh / presented-pending selection. */
export interface LifecycleBillRow {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
}

export interface LifecycleRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  introduced_date: string | null;
  presented_date: string | null;
  signed_date: string | null;
  vetoed_date: string | null;
  became_law_date: string | null;
  law_kind: BillLawKind | null;
  public_law: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  updated_at: string;
}

export interface UpsertLifecycleParams {
  congress: number;
  billType: string;
  billNumber: number;
  introducedDate: string | null;
  presentedDate: string | null;
  signedDate: string | null;
  vetoedDate: string | null;
  becameLawDate: string | null;
  lawKind: BillLawKind | null;
  publicLaw: string | null;
  latestActionDate: string | null;
  latestActionText: string | null;
}

export interface LifecycleBillKey {
  congress: number;
  billType: string;
  billNumber: number;
}

function billKey(congress: number, billType: string, billNumber: number): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
}

function parseLawKind(value: string | null): BillLawKind | null {
  if (
    value === "signed" ||
    value === "law_unsigned" ||
    value === "enacted_over_veto" ||
    value === "vetoed" ||
    value === "pocket_vetoed"
  ) {
    return value;
  }
  return null;
}

export async function upsertLifecycle(
  db: D1Database,
  params: UpsertLifecycleParams
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO bill_lifecycle (
        congress, bill_type, bill_number,
        introduced_date, presented_date, signed_date, vetoed_date, became_law_date,
        law_kind, public_law, latest_action_date, latest_action_text, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
        introduced_date = COALESCE(excluded.introduced_date, bill_lifecycle.introduced_date),
        presented_date = COALESCE(excluded.presented_date, bill_lifecycle.presented_date),
        signed_date = COALESCE(excluded.signed_date, bill_lifecycle.signed_date),
        vetoed_date = COALESCE(excluded.vetoed_date, bill_lifecycle.vetoed_date),
        became_law_date = COALESCE(excluded.became_law_date, bill_lifecycle.became_law_date),
        -- Categorical outcome: replace when the refresh asserts enactment or a
        -- kind; never COALESCE so a prior "vetoed" cannot stick after override.
        law_kind = CASE
          WHEN excluded.became_law_date IS NOT NULL OR excluded.law_kind IS NOT NULL
          THEN excluded.law_kind
          ELSE bill_lifecycle.law_kind
        END,
        public_law = COALESCE(excluded.public_law, bill_lifecycle.public_law),
        latest_action_date = COALESCE(excluded.latest_action_date, bill_lifecycle.latest_action_date),
        latest_action_text = COALESCE(excluded.latest_action_text, bill_lifecycle.latest_action_text),
        updated_at = excluded.updated_at`
    )
    .bind(
      params.congress,
      normalizeBillType(params.billType),
      params.billNumber,
      params.introducedDate,
      params.presentedDate,
      params.signedDate,
      params.vetoedDate,
      params.becameLawDate,
      params.lawKind,
      params.publicLaw,
      params.latestActionDate,
      params.latestActionText,
      now
    )
    .run();
}

export async function getLifecycle(
  db: D1Database,
  congress: number,
  billType: string,
  billNumber: number
): Promise<LifecycleRow | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT congress, bill_type, bill_number,
              introduced_date, presented_date, signed_date, vetoed_date, became_law_date,
              law_kind, public_law, latest_action_date, latest_action_text, updated_at
       FROM bill_lifecycle
       WHERE congress = ? AND UPPER(bill_type) = ? AND bill_number = ?`
    )
    .bind(congress, normalizeBillType(billType), billNumber)
    .first<{
      congress: number;
      bill_type: string;
      bill_number: number;
      introduced_date: string | null;
      presented_date: string | null;
      signed_date: string | null;
      vetoed_date: string | null;
      became_law_date: string | null;
      law_kind: string | null;
      public_law: string | null;
      latest_action_date: string | null;
      latest_action_text: string | null;
      updated_at: string;
    }>();

  if (!row) return null;
  return {
    ...row,
    bill_type: normalizeBillType(row.bill_type),
    law_kind: parseLawKind(row.law_kind),
  };
}

/** D1 caps bound parameters; each bill uses 3 binds in the OR tuple query. */
const LIFECYCLE_LOOKUP_CHUNK = 30;

/**
 * Bulk-read lifecycle rows for a set of bills. Keyed by `congress:TYPE:number`.
 */
export async function getLifecyclesForBills(
  db: D1Database,
  bills: LifecycleBillKey[]
): Promise<Map<string, LifecycleRow>> {
  await ensureSchema(db);
  const map = new Map<string, LifecycleRow>();
  if (bills.length === 0) return map;

  const unique = new Map<string, LifecycleBillKey>();
  for (const bill of bills) {
    unique.set(billKey(bill.congress, bill.billType, bill.billNumber), {
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      billNumber: bill.billNumber,
    });
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i += LIFECYCLE_LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + LIFECYCLE_LOOKUP_CHUNK);
    const clauses = chunk.map(() => "(congress = ? AND UPPER(bill_type) = ? AND bill_number = ?)").join(" OR ");
    const binds: Array<string | number> = [];
    for (const bill of chunk) {
      binds.push(bill.congress, bill.billType, bill.billNumber);
    }
    const { results } = await db
      .prepare(
        `SELECT congress, bill_type, bill_number,
                introduced_date, presented_date, signed_date, vetoed_date, became_law_date,
                law_kind, public_law, latest_action_date, latest_action_text, updated_at
         FROM bill_lifecycle
         WHERE ${clauses}`
      )
      .bind(...binds)
      .all<{
        congress: number;
        bill_type: string;
        bill_number: number;
        introduced_date: string | null;
        presented_date: string | null;
        signed_date: string | null;
        vetoed_date: string | null;
        became_law_date: string | null;
        law_kind: string | null;
        public_law: string | null;
        latest_action_date: string | null;
        latest_action_text: string | null;
        updated_at: string;
      }>();

    for (const row of results ?? []) {
      const type = normalizeBillType(row.bill_type);
      map.set(billKey(row.congress, type, row.bill_number), {
        ...row,
        bill_type: type,
        law_kind: parseLawKind(row.law_kind),
      });
    }
  }

  return map;
}

export function lifecycleMapKey(
  congress: number,
  billType: string,
  billNumber: number
): string {
  return billKey(congress, billType, billNumber);
}

/**
 * Bills that became law in the given congress, newest first.
 * Joins digest title/policy/headline when present. Excludes veto outcomes.
 * Attaches the latest passage-vote date from `votes` when recorded.
 * `item` is left null here; the recent-laws read model attaches feed items.
 */
export async function selectRecentlyEnactedBills(
  db: D1Database,
  congress: number,
  limit: number
): Promise<RecentLawItem[]> {
  await ensureSchema(db);
  const capped = Math.max(0, Math.floor(limit));
  if (capped === 0) return [];

  const { results } = await db
    .prepare(
      `SELECT l.congress, l.bill_type, l.bill_number,
              d.title, d.policy_area,
              json_extract(d.digest_json, '$.headline') AS headline,
              l.became_law_date, l.law_kind, l.public_law,
              l.signed_date, l.presented_date,
              l.latest_action_date, l.latest_action_text,
              v.latest_passage_vote_date
       FROM bill_lifecycle l
       LEFT JOIN (
         SELECT congress, UPPER(bill_type) AS bill_type, number,
                COALESCE(
                  MIN(CASE WHEN title LIKE '%(local sample)%' THEN NULL ELSE title END),
                  MIN(title)
                ) AS title,
                MAX(policy_area) AS policy_area,
                COALESCE(
                  MIN(CASE WHEN digest_json LIKE '%(local sample)%' THEN NULL ELSE digest_json END),
                  MIN(digest_json)
                ) AS digest_json
         FROM bill_digests
         GROUP BY congress, UPPER(bill_type), number
       ) d
         ON d.congress = l.congress
        AND d.bill_type = UPPER(l.bill_type)
        AND d.number = l.bill_number
       LEFT JOIN (
         SELECT bill_congress, UPPER(bill_type) AS bill_type, bill_number,
                MAX(vote_date) AS latest_passage_vote_date
         FROM votes
         WHERE is_passage = 1
         GROUP BY bill_congress, UPPER(bill_type), bill_number
       ) v
         ON v.bill_congress = l.congress
        AND v.bill_type = UPPER(l.bill_type)
        AND v.bill_number = l.bill_number
       WHERE l.congress = ?
         AND l.became_law_date IS NOT NULL
         AND (l.law_kind IS NULL OR l.law_kind NOT IN ('vetoed', 'pocket_vetoed'))
       ORDER BY l.became_law_date DESC, l.latest_action_date DESC
       LIMIT ?`
    )
    .bind(congress, capped)
    .all<{
      congress: number;
      bill_type: string;
      bill_number: number;
      title: string | null;
      policy_area: string | null;
      headline: string | null;
      became_law_date: string;
      law_kind: string | null;
      public_law: string | null;
      signed_date: string | null;
      presented_date: string | null;
      latest_action_date: string | null;
      latest_action_text: string | null;
      latest_passage_vote_date: string | null;
    }>();

  return (results ?? []).map((row) => ({
    congress: row.congress,
    bill_type: normalizeBillType(row.bill_type),
    bill_number: row.bill_number,
    title: row.title,
    policy_area: row.policy_area,
    headline: row.headline,
    became_law_date: row.became_law_date,
    law_kind: parseLawKind(row.law_kind),
    public_law: row.public_law,
    signed_date: row.signed_date,
    presented_date: row.presented_date,
    latest_action_date: row.latest_action_date,
    latest_action_text: row.latest_action_text,
    latest_passage_vote_date: row.latest_passage_vote_date,
    item: null,
  }));
}

/**
 * Lifecycle rows presented to the President that are not yet terminal.
 * Used so enactment can be recorded after the passage-vote lookback expires.
 * Scoped to one congress and capped so the set cannot grow across sessions.
 */
export async function selectPresentedPendingLifecycleBills(
  db: D1Database,
  congress: number,
  limit: number
): Promise<LifecycleBillRow[]> {
  await ensureSchema(db);
  const capped = Math.max(0, Math.floor(limit));
  if (capped === 0) return [];

  const { results } = await db
    .prepare(
      `SELECT congress AS bill_congress, bill_type, bill_number
       FROM bill_lifecycle
       WHERE congress = ?
         AND presented_date IS NOT NULL
         AND (
           became_law_date IS NULL
           OR (law_kind = 'law_unsigned' AND (public_law IS NULL OR public_law = ''))
         )
       ORDER BY presented_date ASC, latest_action_date ASC
       LIMIT ?`
    )
    .bind(congress, capped)
    .all<{
      bill_congress: number;
      bill_type: string;
      bill_number: number;
    }>();

  return (results ?? []).map((row) => ({
    bill_congress: row.bill_congress,
    bill_type: normalizeBillType(row.bill_type),
    bill_number: row.bill_number,
  }));
}
