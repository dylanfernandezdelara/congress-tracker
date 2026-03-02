import type {
  V2MemberActivitiesQuery,
  V2MemberActivitiesResponse,
  V2MembersQuery,
  V2MembersResponse,
  V2MetaResponse,
  V2StateTimeseriesResponse,
  V2VotesQuery,
  V2VotesResponse,
} from "../types";
import { getActiveRunId } from "./publish";

function b64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(input: string): string {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

export function encodeCursor(payload: Record<string, unknown>): string {
  return b64urlEncode(JSON.stringify(payload));
}

export function decodeCursor(cursor: string | null): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    return JSON.parse(b64urlDecode(cursor));
  } catch {
    return null;
  }
}

export async function queryV2Votes(db: D1Database, query: V2VotesQuery): Promise<V2VotesResponse> {
  const runId = await getActiveRunId(db);
  if (!runId) {
    return { items: [], next_cursor: null, partial: true, run_id: null, generated_at: new Date().toISOString() };
  }
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
  const cursor = decodeCursor(query.cursor ?? null);

  const where: string[] = ["vf.run_id = ?1"];
  const binds: unknown[] = [runId];

  if (query.issue_type) {
    where.push("vf.issue_type = ?" + (binds.length + 1));
    binds.push(query.issue_type);
  }
  if (query.from) {
    where.push("vf.vote_date >= ?" + (binds.length + 1));
    binds.push(query.from);
  }
  if (query.to) {
    where.push("vf.vote_date <= ?" + (binds.length + 1));
    binds.push(query.to);
  }
  if (query.state || query.party) {
    where.push(
      `EXISTS (
        SELECT 1 FROM vote_member_fact vmf
        WHERE vmf.run_id = vf.run_id
          AND vmf.vote_id = vf.vote_id
          ${query.state ? `AND vmf.state = ?${binds.length + 1}` : ""}
          ${query.party ? `AND vmf.party = ?${binds.length + (query.state ? 2 : 1)}` : ""}
      )`
    );
    if (query.state) binds.push(query.state);
    if (query.party) binds.push(query.party);
  }
  if (cursor?.vote_date && cursor?.vote_number) {
    where.push(`(vf.vote_date < ?${binds.length + 1} OR (vf.vote_date = ?${binds.length + 2} AND vf.vote_number < ?${binds.length + 3}))`);
    binds.push(cursor.vote_date, cursor.vote_date, cursor.vote_number);
  }

  binds.push(limit + 1);
  const sql = `
    SELECT vf.vote_id, vf.vote_date, vf.vote_number, vf.title, vf.question, vf.result, vf.issue, vf.issue_type
    FROM votes_fact vf
    WHERE ${where.join(" AND ")}
    ORDER BY vf.vote_date DESC, vf.vote_number DESC
    LIMIT ?${binds.length}
  `;
  const rows = await db.prepare(sql).bind(...binds).all<any>();
  const items = rows.results.slice(0, limit);
  const next = rows.results[limit];

  const meta = await queryMeta(db, runId);
  return {
    items,
    next_cursor: next ? encodeCursor({ vote_date: next.vote_date, vote_number: next.vote_number }) : null,
    partial: meta.partial,
    run_id: runId,
    generated_at: meta.generated_at,
  };
}

export async function queryV2Members(db: D1Database, query: V2MembersQuery): Promise<V2MembersResponse> {
  const runId = await getActiveRunId(db);
  if (!runId) return { items: [], next_cursor: null, partial: true, run_id: null };
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
  const metricDate = query.metric_date ?? new Date().toISOString().slice(0, 10);
  const cursor = decodeCursor(query.cursor ?? null);

  const where = ["mdm.run_id = ?1", "mdm.metric_date = ?2"];
  const binds: unknown[] = [runId, metricDate];
  if (query.state) {
    where.push("mdm.state = ?" + (binds.length + 1));
    binds.push(query.state);
  }
  if (query.party) {
    where.push("m.party = ?" + (binds.length + 1));
    binds.push(query.party);
  }
  if (cursor?.activity_score && cursor?.bioguide_id) {
    where.push(`(mdm.activity_score < ?${binds.length + 1} OR (mdm.activity_score = ?${binds.length + 2} AND mdm.bioguide_id > ?${binds.length + 3}))`);
    binds.push(cursor.activity_score, cursor.activity_score, cursor.bioguide_id);
  }
  binds.push(limit + 1);

  const sql = `
    SELECT mdm.bioguide_id, m.name, m.party, mdm.state, mdm.activity_score,
           mdm.defection_count, mdm.sponsored_count, mdm.cosponsored_count, mdm.vote_count
    FROM member_daily_metrics mdm
    JOIN members_dim m ON m.run_id = mdm.run_id AND m.bioguide_id = mdm.bioguide_id
    WHERE ${where.join(" AND ")}
    ORDER BY mdm.activity_score DESC, mdm.bioguide_id ASC
    LIMIT ?${binds.length}
  `;
  const rows = await db.prepare(sql).bind(...binds).all<any>();
  const items = rows.results.slice(0, limit);
  const next = rows.results[limit];
  const meta = await queryMeta(db, runId);
  return {
    items,
    next_cursor: next
      ? encodeCursor({ activity_score: next.activity_score, bioguide_id: next.bioguide_id })
      : null,
    partial: meta.partial,
    run_id: runId,
  };
}

export async function queryV2MemberActivities(
  db: D1Database,
  bioguideId: string,
  query: V2MemberActivitiesQuery
): Promise<V2MemberActivitiesResponse> {
  const runId = await getActiveRunId(db);
  if (!runId) return { items: [], partial: true, run_id: null };

  const where = ["run_id = ?1", "bioguide_id = ?2"];
  const binds: unknown[] = [runId, bioguideId];
  if (query.from) {
    where.push("activity_date >= ?" + (binds.length + 1));
    binds.push(query.from);
  }
  if (query.to) {
    where.push("activity_date <= ?" + (binds.length + 1));
    binds.push(query.to);
  }
  if (query.types?.length) {
    where.push(`type IN (${query.types.map((_, i) => `?${binds.length + i + 1}`).join(",")})`);
    binds.push(...query.types);
  }
  if (query.sources?.length) {
    where.push(`source IN (${query.sources.map((_, i) => `?${binds.length + i + 1}`).join(",")})`);
    binds.push(...query.sources);
  }

  const rows = await db
    .prepare(
      `SELECT activity_id, activity_date, source, type, payload_json
       FROM member_activity_fact
       WHERE ${where.join(" AND ")}
       ORDER BY activity_date DESC, activity_id DESC`
    )
    .bind(...binds)
    .all<any>();

  const meta = await queryMeta(db, runId);
  return {
    items: rows.results.map((r) => ({
      activity_id: r.activity_id,
      activity_date: r.activity_date,
      source: r.source,
      type: r.type,
      payload_json: JSON.parse(r.payload_json),
    })),
    partial: meta.partial,
    run_id: runId,
  };
}

export async function queryV2StateTimeseries(
  db: D1Database,
  state: string,
  from?: string,
  to?: string
): Promise<V2StateTimeseriesResponse> {
  const runId = await getActiveRunId(db);
  if (!runId) return { items: [], partial: true, run_id: null };

  const where = ["run_id = ?1", "state = ?2"];
  const binds: unknown[] = [runId, state];
  if (from) {
    where.push("metric_date >= ?" + (binds.length + 1));
    binds.push(from);
  }
  if (to) {
    where.push("metric_date <= ?" + (binds.length + 1));
    binds.push(to);
  }
  const rows = await db
    .prepare(
      `SELECT metric_date, votes_count, defection_count
       FROM state_daily_metrics
       WHERE ${where.join(" AND ")}
       ORDER BY metric_date DESC`
    )
    .bind(...binds)
    .all<any>();

  const meta = await queryMeta(db, runId);
  return { items: rows.results, partial: meta.partial, run_id: runId };
}

export async function queryMeta(db: D1Database, activeRunId?: string): Promise<V2MetaResponse> {
  const runId = activeRunId ?? (await getActiveRunId(db));
  if (!runId) {
    return {
      run_id: null,
      status: "failed",
      partial: true,
      window_start: null,
      window_end: null,
      generated_at: new Date().toISOString(),
    };
  }

  const row = await db
    .prepare(
      `SELECT run_id, status, partial, window_start, window_end, finished_at
       FROM ingestion_runs WHERE run_id = ?1`
    )
    .bind(runId)
    .first<any>();

  return {
    run_id: row?.run_id ?? runId,
    status: row?.status ?? "success",
    partial: Boolean(row?.partial),
    window_start: row?.window_start ?? null,
    window_end: row?.window_end ?? null,
    generated_at: row?.finished_at ?? new Date().toISOString(),
  };
}
