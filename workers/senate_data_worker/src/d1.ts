import { buildBillKey } from "./congress";
import type { ActivityIndexJson, BillRef, SessionOverview, VoteLedger } from "./types";
import type {
  ArgumentExcerpt,
  BriefingFeedItem,
  BriefingFeedResponse,
  HistoricalVoteReference,
  PartyArgumentSummary,
  PipelineMaterialization,
  SourceCoverage,
  VoteDetailResponse,
} from "./platform-types";
import { buildIssueKey, buildThreadKey, buildVoteDetailResponse } from "./read-model";
import type { VoteDetails } from "./xml";

const PLATFORM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS votes (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  vote_date TEXT NOT NULL,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  result TEXT NOT NULL,
  issue TEXT,
  bill_key TEXT,
  policy_area TEXT,
  thread_key TEXT NOT NULL,
  issue_key TEXT,
  status TEXT NOT NULL,
  significance TEXT NOT NULL,
  score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS vote_members (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  bioguide_id TEXT NOT NULL,
  name TEXT NOT NULL,
  party TEXT NOT NULL,
  state TEXT NOT NULL,
  vote_cast TEXT NOT NULL,
  against_party_majority INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (congress, session, vote_number, bioguide_id)
);

CREATE TABLE IF NOT EXISTS bills (
  bill_key TEXT PRIMARY KEY,
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  policy_area TEXT,
  url TEXT,
  significance TEXT,
  category TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_threads (
  thread_key TEXT PRIMARY KEY,
  display_title TEXT NOT NULL,
  policy_area TEXT,
  bill_key TEXT,
  recurrence_count INTEGER NOT NULL,
  last_vote_date TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_thread_votes (
  thread_key TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  PRIMARY KEY (thread_key, congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS importance_scores (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS record_documents (
  document_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  document_date TEXT,
  url TEXT,
  thread_key TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS argument_excerpts (
  excerpt_id TEXT PRIMARY KEY,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  party TEXT,
  source_document_id TEXT,
  source_type TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT,
  excerpt_text TEXT,
  note TEXT,
  document_date TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS party_argument_summaries (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  party TEXT NOT NULL,
  stance TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  excerpt_ids_json TEXT NOT NULL,
  coverage_note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number, party)
);

CREATE TABLE IF NOT EXISTS historical_context (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  thread_key TEXT NOT NULL,
  recurrence_count INTEGER NOT NULL,
  last_comparable_vote_json TEXT,
  related_votes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS daily_briefings (
  briefing_key TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vote_read_models (
  detail_key TEXT PRIMARY KEY,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_fetch_log (
  cache_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  request_url TEXT NOT NULL,
  status_code INTEGER,
  content_type TEXT,
  artifact_key TEXT,
  fetched_at TEXT NOT NULL,
  error_message TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_checkpoints (
  checkpoint_key TEXT PRIMARY KEY,
  cursor_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_votes_vote_date
  ON votes (vote_date DESC, congress, session, vote_number);

CREATE INDEX IF NOT EXISTS idx_votes_thread_key
  ON votes (thread_key, vote_date DESC, vote_number DESC);
`;

const PLATFORM_SCHEMA_STATEMENTS = PLATFORM_SCHEMA_SQL
  .split(/;\s*\n+/)
  .map((statement) => statement.trim())
  .filter(Boolean);

function toSqlBool(value: boolean): number {
  return value ? 1 : 0;
}

function canBuildBillKey(bill: BillRef | undefined): bill is BillRef {
  return Boolean(
    bill &&
      typeof bill.congress === "number" &&
      typeof bill.type === "string" &&
      bill.type.trim() &&
      typeof bill.number === "string" &&
      bill.number.trim()
  );
}

export interface SourceFetchLogRecord {
  cacheKey: string;
  source: string;
  entityKey: string;
  requestUrl: string;
  statusCode?: number;
  contentType?: string;
  artifactKey?: string;
  fetchedAt: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineCheckpointRecord<T = Record<string, unknown>> {
  checkpointKey: string;
  cursor: T;
  updatedAt: string;
}

export interface RecordDocumentWrite {
  documentId: string;
  source: string;
  title: string;
  documentDate?: string;
  url?: string;
  threadKey?: string;
  metadata?: Record<string, unknown>;
}

export interface VoteArgumentExcerptWrite extends ArgumentExcerpt {
  sourceDocumentId?: string;
}

export interface VoteEvidenceWrite {
  documents: RecordDocumentWrite[];
  excerpts: VoteArgumentExcerptWrite[];
  parties: PartyArgumentSummary[];
}

function normalizeVoteStatus(result: string): VoteDetailResponse["vote"]["status"] {
  const normalized = result.toLowerCase();
  if (/failed|rejected|not agreed|not passed|disagreed|not invoked|not confirmed/.test(normalized)) {
    return "rejected";
  }
  return /agreed to|agreed|passed|confirmed|invoked|adopted|approved/.test(normalized)
    ? "passed"
    : "rejected";
}

function normalizeHistoricalBillType(rawType: string): string {
  const normalized = rawType.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "HR") return "H.R.";
  if (normalized === "S") return "S";
  if (normalized === "HJRES") return "H.J.RES.";
  if (normalized === "SJRES") return "S.J.RES.";
  if (normalized === "HCONRES") return "H.CON.RES.";
  if (normalized === "SCONRES") return "S.CON.RES.";
  if (normalized === "HRES") return "H.RES.";
  if (normalized === "SRES") return "S.RES.";
  return rawType.toUpperCase();
}

function extractHistoricalThreadKey(detail: VoteDetails): string {
  const text = `${detail.vote_document ?? ""} ${detail.vote_title} ${detail.vote_question}`;
  const match = text.match(
    /\b(S\.?J\.?RES\.?|S\.?CON\.?RES\.?|S\.?RES\.?|S\.?|H\.?J\.?RES\.?|H\.?CON\.?RES\.?|H\.?RES\.?|H\.?R\.?)\s*\.?\s*(\d+)\b/i
  );
  if (match) {
    return `${detail.congress}:${normalizeHistoricalBillType(match[1])}:${match[2]}`;
  }
  const issue = detail.vote_document?.trim();
  if (issue) return issue.toUpperCase();
  return `vote:${detail.congress}:${detail.session}:${detail.vote_number}`;
}

function extractHistoricalIssueKey(detail: VoteDetails): string {
  const threadKey = extractHistoricalThreadKey(detail);
  const entryLike = {
    vote_number: detail.vote_number,
    vote_date: detail.vote_date,
    title: detail.vote_title,
    question: detail.vote_question,
    result: detail.vote_result,
    issue: detail.vote_document ?? undefined,
    member_votes: {},
  };
  return buildIssueKey(entryLike, undefined) || threadKey;
}

function mergeCoverage(
  coverage: SourceCoverage,
  hasRecordData: boolean,
  hasFloorLogs: boolean
): SourceCoverage {
  const level: SourceCoverage["level"] =
    coverage.bill_context && (hasRecordData || hasFloorLogs)
      ? "full"
      : coverage.level;
  return {
    ...coverage,
    level,
    congressional_record: coverage.congressional_record || hasRecordData,
    floor_logs: coverage.floor_logs || hasFloorLogs,
    note:
      hasRecordData || hasFloorLogs
        ? undefined
        : coverage.note,
  };
}

function isEarlierVote(
  candidate: HistoricalVoteReference,
  current: HistoricalVoteReference
): boolean {
  if (candidate.vote_date !== current.vote_date) {
    return candidate.vote_date < current.vote_date;
  }
  if (candidate.congress !== current.congress) {
    return candidate.congress < current.congress;
  }
  if (candidate.session !== current.session) {
    return candidate.session < current.session;
  }
  return candidate.vote_number < current.vote_number;
}

async function ensureColumn(
  db: D1Database,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<Record<string, unknown>>();
  const exists = (result.results ?? []).some((row) => String(row.name) === column);
  if (!exists) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

export async function ensurePlatformSchema(db: D1Database): Promise<void> {
  await db.batch(PLATFORM_SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)));
  await ensureColumn(db, "votes", "issue_key", "TEXT");
  await db.prepare("UPDATE votes SET issue_key = thread_key WHERE issue_key IS NULL").run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_votes_issue_key ON votes (issue_key, vote_date DESC, congress DESC, session DESC, vote_number DESC)"
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_vote_members_vote_lookup ON vote_members (congress, session, vote_number, party)"
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_issue_thread_votes_lookup ON issue_thread_votes (congress, session, vote_number, thread_key)"
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_argument_excerpts_vote_lookup ON argument_excerpts (congress, session, vote_number, party)"
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_vote_read_models_lookup ON vote_read_models (congress, session, vote_number)"
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_source_fetch_lookup ON source_fetch_log (source, entity_key, fetched_at DESC)"
    )
    .run();
}

export async function writePlatformMaterializationToD1(
  db: D1Database,
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexJson | null,
  materialization: PipelineMaterialization
): Promise<void> {
  await ensurePlatformSchema(db);
  const now = new Date().toISOString();
  const billLookup = new Map<number, BillRef>();
  const briefingItemByVoteNumber = new Map(
    materialization.briefing.items.map((item) => [item.vote_number, item] as const)
  );
  for (const activity of activities?.activities ?? []) {
    if (activity.type !== "roll_call_vote" || !activity.bill) continue;
    const voteNumber = Number(activity.activity_id.split(":").at(-1));
    if (!Number.isNaN(voteNumber)) billLookup.set(voteNumber, activity.bill);
  }
  const senatorById = new Map(overview.senators.map((senator) => [senator.bioguide_id, senator]));

  await db.prepare("DELETE FROM vote_members WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM issue_thread_votes WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM importance_scores WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM historical_context WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM vote_read_models WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();

  for (const detail of materialization.voteDetails) {
    const item = briefingItemByVoteNumber.get(detail.vote.vote_number);
    const bill = detail.vote.bill;
    const billKey = canBuildBillKey(bill) ? buildBillKey(bill) : null;
    const sourceEntry = ledger.entries.find((entry) => entry.vote_number === detail.vote.vote_number);
    if (!sourceEntry) continue;
    const threadKey = buildThreadKey(sourceEntry, bill);
    await db
      .prepare(
        `INSERT OR REPLACE INTO votes (
          congress, session, vote_number, vote_date, title, question, result, issue,
          bill_key, policy_area, thread_key, issue_key, status, significance, score, summary, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.vote.congress,
        detail.vote.session,
        detail.vote.vote_number,
        detail.vote.vote_date,
        detail.vote.title,
        detail.vote.question,
        detail.vote.result,
        detail.vote.issue ?? null,
        billKey,
        bill?.policy_area ?? null,
        threadKey,
        buildIssueKey(sourceEntry, bill),
        detail.vote.status,
        item?.significance ?? bill?.analysis?.significance ?? "low",
        item ? Math.round(item.score) : 0,
        item?.summary ?? `Senate vote on ${detail.vote.title}.`,
        now
      )
      .run();

    if (item) {
      await db
        .prepare(
          `INSERT OR REPLACE INTO importance_scores (
            congress, session, vote_number, score, reasons_json, generated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.congress,
          item.session,
          item.vote_number,
          Math.round(item.score),
          JSON.stringify(item.ranking_reasons),
          materialization.briefing.generated_at
        )
        .run();
    }

    if (billKey && bill) {
      await db
        .prepare(
          `INSERT OR REPLACE INTO bills (
            bill_key, congress, bill_type, bill_number, title, summary, policy_area, url,
            significance, category, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          billKey,
          bill.congress,
          bill.type,
          bill.number,
          bill.title ?? null,
          bill.summary ?? null,
          bill.policy_area ?? null,
          bill.url ?? null,
          bill.analysis?.significance ?? null,
          bill.analysis?.category ?? null,
          now
        )
        .run();
    }
  }

  const threadMembers = new Map<string, { title: string; policy_area?: string; bill_key?: string; voteDates: string[]; votes: number[] }>();
  for (const entry of ledger.entries) {
    const bill = billLookup.get(entry.vote_number);
    const threadKey = buildThreadKey(entry, bill);
    const group = threadMembers.get(threadKey) ?? {
      title: bill?.title ?? entry.title,
      policy_area: bill?.policy_area ?? entry.policy_area,
      bill_key: canBuildBillKey(bill) ? buildBillKey(bill) : undefined,
      voteDates: [],
      votes: [],
    };
    group.voteDates.push(entry.vote_date);
    group.votes.push(entry.vote_number);
    threadMembers.set(threadKey, group);

    await db
      .prepare(
        "INSERT OR REPLACE INTO issue_thread_votes (thread_key, congress, session, vote_number) VALUES (?, ?, ?, ?)"
      )
      .bind(threadKey, ledger.congress, ledger.session, entry.vote_number)
      .run();

    for (const [bioguideId, voteCast] of Object.entries(entry.member_votes)) {
      const senator = senatorById.get(bioguideId);
      if (!senator) continue;
      const majorityVote = itemPartyMajority(ledger, overview, entry.vote_number).get(senator.party);
      await db
        .prepare(
          `INSERT OR REPLACE INTO vote_members (
            congress, session, vote_number, bioguide_id, name, party, state, vote_cast, against_party_majority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          ledger.congress,
          ledger.session,
          entry.vote_number,
          bioguideId,
          senator.name,
          senator.party,
          senator.state,
          voteCast,
          toSqlBool(Boolean(majorityVote) && voteCast.toLowerCase() !== majorityVote)
        )
        .run();
    }
  }

  for (const [threadKey, group] of threadMembers.entries()) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO issue_threads (
          thread_key, display_title, policy_area, bill_key, recurrence_count, last_vote_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        threadKey,
        group.title,
        group.policy_area ?? null,
        group.bill_key ?? null,
        group.votes.length,
        [...group.voteDates].sort().at(-1) ?? now.slice(0, 10),
        now
      )
      .run();
  }

  await db
    .prepare(
      `DELETE FROM issue_threads
      WHERE thread_key NOT IN (SELECT DISTINCT thread_key FROM issue_thread_votes)`
    )
    .run();

  for (const detail of materialization.voteDetails) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO vote_read_models (
          detail_key, congress, session, vote_number, generated_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.vote.id,
        detail.vote.congress,
        detail.vote.session,
        detail.vote.vote_number,
        detail.generated_at,
        JSON.stringify(detail)
      )
      .run();

    await db
      .prepare(
        `INSERT OR REPLACE INTO historical_context (
          congress, session, vote_number, thread_key, recurrence_count, last_comparable_vote_json, related_votes_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.vote.congress,
        detail.vote.session,
        detail.vote.vote_number,
        detail.history.thread_key,
        detail.history.measure_recurrence_count,
        detail.history.last_comparable_vote ? JSON.stringify(detail.history.last_comparable_vote) : null,
        JSON.stringify(detail.history.related_votes),
        now
      )
      .run();

  }

  await db
    .prepare("INSERT OR REPLACE INTO daily_briefings (briefing_key, generated_at, payload_json) VALUES (?, ?, ?)")
    .bind("latest", materialization.briefing.generated_at, JSON.stringify(materialization.briefing))
    .run();
}

function itemPartyMajority(ledger: VoteLedger, overview: SessionOverview, voteNumber: number): Map<string, string> {
  const detail = buildVoteDetailResponse(ledger, overview, null, voteNumber);
  const map = new Map<string, string>();
  for (const party of detail?.party_breakdown ?? []) {
    if (party.majority_vote) map.set(party.party, party.majority_vote);
  }
  return map;
}

export async function recordSourceFetchLog(
  db: D1Database,
  record: SourceFetchLogRecord
): Promise<void> {
  await ensurePlatformSchema(db);
  await db
    .prepare(
      `INSERT OR REPLACE INTO source_fetch_log (
        cache_key, source, entity_key, request_url, status_code, content_type,
        artifact_key, fetched_at, error_message, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.cacheKey,
      record.source,
      record.entityKey,
      record.requestUrl,
      record.statusCode ?? null,
      record.contentType ?? null,
      record.artifactKey ?? null,
      record.fetchedAt,
      record.errorMessage ?? null,
      record.metadata ? JSON.stringify(record.metadata) : null
    )
    .run();
}

export async function readSourceFetchLog(
  db: D1Database,
  cacheKey: string
): Promise<SourceFetchLogRecord | null> {
  await ensurePlatformSchema(db);
  const result = await db
    .prepare(
      `SELECT cache_key, source, entity_key, request_url, status_code, content_type,
        artifact_key, fetched_at, error_message, metadata_json
      FROM source_fetch_log
      WHERE cache_key = ?
      LIMIT 1`
    )
    .bind(cacheKey)
    .all<Record<string, unknown>>();
  const row = result.results?.[0];
  if (!row) return null;
  return {
    cacheKey: String(row.cache_key),
    source: String(row.source),
    entityKey: String(row.entity_key),
    requestUrl: String(row.request_url),
    statusCode: row.status_code === null || row.status_code === undefined ? undefined : Number(row.status_code),
    contentType: row.content_type ? String(row.content_type) : undefined,
    artifactKey: row.artifact_key ? String(row.artifact_key) : undefined,
    fetchedAt: String(row.fetched_at),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    metadata:
      typeof row.metadata_json === "string" && row.metadata_json
        ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
        : undefined,
  };
}

export async function writePipelineCheckpoint<T>(
  db: D1Database,
  checkpointKey: string,
  cursor: T
): Promise<void> {
  await ensurePlatformSchema(db);
  await db
    .prepare(
      `INSERT OR REPLACE INTO pipeline_checkpoints (
        checkpoint_key, cursor_json, updated_at
      ) VALUES (?, ?, ?)`
    )
    .bind(checkpointKey, JSON.stringify(cursor), new Date().toISOString())
    .run();
}

export async function readPipelineCheckpoint<T>(
  db: D1Database,
  checkpointKey: string
): Promise<PipelineCheckpointRecord<T> | null> {
  await ensurePlatformSchema(db);
  const result = await db
    .prepare(
      `SELECT checkpoint_key, cursor_json, updated_at
      FROM pipeline_checkpoints
      WHERE checkpoint_key = ?
      LIMIT 1`
    )
    .bind(checkpointKey)
    .all<Record<string, unknown>>();
  const row = result.results?.[0];
  if (!row) return null;
  return {
    checkpointKey: String(row.checkpoint_key),
    cursor: JSON.parse(String(row.cursor_json)) as T,
    updatedAt: String(row.updated_at),
  };
}

export async function writeHistoricalVoteBatchToD1(
  db: D1Database,
  details: VoteDetails[]
): Promise<void> {
  if (details.length === 0) return;
  await ensurePlatformSchema(db);
  const now = new Date().toISOString();
  const touchedThreads = new Set<string>();

  for (const detail of details) {
    const threadKey = extractHistoricalThreadKey(detail);
    const issueKey = extractHistoricalIssueKey(detail);
    touchedThreads.add(threadKey);

    await db
      .prepare(
        `INSERT OR IGNORE INTO votes (
          congress, session, vote_number, vote_date, title, question, result, issue,
          bill_key, policy_area, thread_key, issue_key, status, significance, score, summary, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.congress,
        detail.session,
        detail.vote_number,
        detail.vote_date,
        detail.vote_title,
        detail.vote_question,
        detail.vote_result,
        detail.vote_document ?? null,
        null,
        null,
        threadKey,
        issueKey,
        normalizeVoteStatus(detail.vote_result),
        "low",
        0,
        `Historical Senate vote on ${detail.vote_title}.`,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT OR IGNORE INTO issue_thread_votes (
          thread_key, congress, session, vote_number
        ) VALUES (?, ?, ?, ?)`
      )
      .bind(threadKey, detail.congress, detail.session, detail.vote_number)
      .run();
  }

  for (const threadKey of touchedThreads) {
    const latestResult = await db
      .prepare(
        `SELECT title, policy_area, bill_key, vote_date
        FROM votes
        WHERE thread_key = ?
        ORDER BY vote_date DESC, congress DESC, session DESC, vote_number DESC
        LIMIT 1`
      )
      .bind(threadKey)
      .all<Record<string, unknown>>();
    const countResult = await db
      .prepare("SELECT COUNT(*) AS total FROM votes WHERE thread_key = ?")
      .bind(threadKey)
      .all<Record<string, unknown>>();
    const latestRow = latestResult.results?.[0];
    const total = Number(countResult.results?.[0]?.total ?? 0);
    if (!latestRow || total <= 0) continue;

    await db
      .prepare(
        `INSERT OR REPLACE INTO issue_threads (
          thread_key, display_title, policy_area, bill_key, recurrence_count, last_vote_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        threadKey,
        String(latestRow.title),
        latestRow.policy_area ? String(latestRow.policy_area) : null,
        latestRow.bill_key ? String(latestRow.bill_key) : null,
        total,
        String(latestRow.vote_date),
        now
      )
      .run();
  }
}

export async function writeVoteEvidenceToD1(
  db: D1Database,
  congress: number,
  session: number,
  voteNumber: number,
  evidence: VoteEvidenceWrite
): Promise<void> {
  await ensurePlatformSchema(db);
  const now = new Date().toISOString();

  await db
    .prepare("DELETE FROM party_argument_summaries WHERE congress = ? AND session = ? AND vote_number = ?")
    .bind(congress, session, voteNumber)
    .run();
  await db
    .prepare("DELETE FROM argument_excerpts WHERE congress = ? AND session = ? AND vote_number = ?")
    .bind(congress, session, voteNumber)
    .run();

  for (const document of evidence.documents) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO record_documents (
          document_id, source, title, document_date, url, thread_key, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        document.documentId,
        document.source,
        document.title,
        document.documentDate ?? null,
        document.url ?? null,
        document.threadKey ?? null,
        document.metadata ? JSON.stringify(document.metadata) : null,
        now
      )
      .run();
  }

  for (const partySummary of evidence.parties) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO party_argument_summaries (
          congress, session, vote_number, party, stance, summary_text, confidence, evidence_json,
          excerpt_ids_json, coverage_note, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        congress,
        session,
        voteNumber,
        partySummary.party,
        partySummary.stance,
        partySummary.summary,
        partySummary.confidence,
        JSON.stringify(partySummary.evidence_points),
        JSON.stringify(partySummary.excerpt_ids),
        partySummary.coverage_note ?? null,
        now
      )
      .run();
  }

  for (const excerpt of evidence.excerpts) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO argument_excerpts (
          excerpt_id, congress, session, vote_number, party, source_document_id, source_type,
          source_label, source_url, excerpt_text, note, document_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        excerpt.id,
        congress,
        session,
        voteNumber,
        excerpt.party ?? null,
        excerpt.sourceDocumentId ?? null,
        excerpt.source_type,
        excerpt.source_label,
        excerpt.source_url ?? null,
        excerpt.quote ?? null,
        excerpt.note ?? null,
        excerpt.date ?? null,
        now
      )
      .run();
  }
}

async function readVoteSourceCoverage(
  db: D1Database,
  item: Pick<BriefingFeedItem, "congress" | "session" | "vote_number" | "source_coverage">
): Promise<SourceCoverage> {
  const result = await db
    .prepare(
      `SELECT source_type, COUNT(*) AS total
      FROM argument_excerpts
      WHERE congress = ? AND session = ? AND vote_number = ?
      GROUP BY source_type`
    )
    .bind(item.congress, item.session, item.vote_number)
    .all<Record<string, unknown>>();

  let hasRecordData = false;
  let hasFloorLogs = false;
  for (const row of result.results ?? []) {
    const sourceType = String(row.source_type ?? "");
    if (sourceType === "congress_record") hasRecordData = true;
    if (sourceType === "floor_log") hasFloorLogs = true;
  }
  return mergeCoverage(item.source_coverage, hasRecordData, hasFloorLogs);
}

async function readOfficialArgumentsForVote(
  db: D1Database,
  detail: VoteDetailResponse
): Promise<VoteDetailResponse["arguments"] | null> {
  const [summaryResult, excerptResult] = await Promise.all([
    db
      .prepare(
        `SELECT party, stance, summary_text, confidence, evidence_json, excerpt_ids_json, coverage_note
        FROM party_argument_summaries
        WHERE congress = ? AND session = ? AND vote_number = ?`
      )
      .bind(detail.vote.congress, detail.vote.session, detail.vote.vote_number)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT excerpt_id, party, source_type, source_label, source_url, excerpt_text, note, document_date
        FROM argument_excerpts
        WHERE congress = ? AND session = ? AND vote_number = ?
        ORDER BY COALESCE(document_date, '') DESC, excerpt_id`
      )
      .bind(detail.vote.congress, detail.vote.session, detail.vote.vote_number)
      .all<Record<string, unknown>>(),
  ]);

  if ((summaryResult.results?.length ?? 0) === 0 && (excerptResult.results?.length ?? 0) === 0) {
    return null;
  }

  const summariesByParty = new Map<string, PartyArgumentSummary>();
  for (const row of summaryResult.results ?? []) {
    summariesByParty.set(String(row.party), {
      party: String(row.party),
      stance: String(row.stance) as PartyArgumentSummary["stance"],
      summary: String(row.summary_text),
      confidence: String(row.confidence) as PartyArgumentSummary["confidence"],
      evidence_points: JSON.parse(String(row.evidence_json)) as string[],
      excerpt_ids: JSON.parse(String(row.excerpt_ids_json)) as string[],
      coverage_note: row.coverage_note ? String(row.coverage_note) : undefined,
    });
  }

  const excerpts: ArgumentExcerpt[] = (excerptResult.results ?? []).map((row) => ({
    id: String(row.excerpt_id),
    party: row.party ? String(row.party) : undefined,
    source_type: String(row.source_type) as ArgumentExcerpt["source_type"],
    source_label: String(row.source_label),
    source_url: row.source_url ? String(row.source_url) : undefined,
    quote: row.excerpt_text ? String(row.excerpt_text) : undefined,
    note: row.note ? String(row.note) : undefined,
    date: row.document_date ? String(row.document_date) : undefined,
  }));

  const parties = detail.party_breakdown.map((partyBreakdown) => {
    return (
      summariesByParty.get(partyBreakdown.party) ?? {
        party: partyBreakdown.party,
        stance: "mixed" as const,
        summary:
          "Insufficient sourced evidence in the current official-record window to summarize a party-specific rationale.",
        confidence: "low" as const,
        evidence_points: [],
        excerpt_ids: [],
        coverage_note: "No linked official excerpts were captured for this party in the current evidence window.",
      }
    );
  });

  const partiesWithEvidence = parties.filter((party) => party.excerpt_ids.length > 0).length;
  return {
    available: excerpts.length > 0 || partiesWithEvidence > 0,
    coverage_note:
      partiesWithEvidence === parties.length
        ? "Argument summaries are grounded in linked official excerpts."
        : "Official excerpts are available for part of the chamber; parties without linked evidence are marked explicitly.",
    parties,
    excerpts,
  };
}

async function readHistoricalContextForVote(
  db: D1Database,
  detail: VoteDetailResponse
): Promise<VoteDetailResponse["history"]> {
  const issueKey = detail.history.issue_key || detail.history.thread_key;
  const currentRef: HistoricalVoteReference = {
    congress: detail.vote.congress,
    session: detail.vote.session,
    vote_number: detail.vote.vote_number,
    vote_date: detail.vote.vote_date,
    title: detail.vote.title,
    result: detail.vote.result,
  };
  const [threadCountResult, issueCountResult, firstSeenResult, votesResult] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS total FROM votes WHERE thread_key = ?")
      .bind(detail.history.thread_key)
      .all<Record<string, unknown>>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM votes WHERE COALESCE(issue_key, thread_key) = ?")
      .bind(issueKey)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT vote_date
        FROM votes
        WHERE COALESCE(issue_key, thread_key) = ?
        ORDER BY vote_date ASC, congress ASC, session ASC, vote_number ASC
        LIMIT 1`
      )
      .bind(issueKey)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT congress, session, vote_number, vote_date, title, result
        FROM votes
        WHERE COALESCE(issue_key, thread_key) = ?
        ORDER BY vote_date DESC, congress DESC, session DESC, vote_number DESC
        LIMIT 12`
      )
      .bind(issueKey)
      .all<Record<string, unknown>>(),
  ]);

  const references: HistoricalVoteReference[] = (votesResult.results ?? []).map((row) => ({
    congress: Number(row.congress),
    session: Number(row.session),
    vote_number: Number(row.vote_number),
    vote_date: String(row.vote_date),
    title: String(row.title),
    result: String(row.result),
  }));
  const relatedVotes = references
    .filter((reference) => !(reference.congress === currentRef.congress && reference.session === currentRef.session && reference.vote_number === currentRef.vote_number))
    .slice(0, 5);
  const lastComparableVote = references.find((reference) => isEarlierVote(reference, currentRef));

  return {
    thread_key: detail.history.thread_key,
    measure_recurrence_count: Number(
      threadCountResult.results?.[0]?.total ?? detail.history.measure_recurrence_count
    ),
    issue_key: issueKey,
    issue_title: detail.history.issue_title,
    issue_recurrence_count: Number(
      issueCountResult.results?.[0]?.total ?? detail.history.issue_recurrence_count
    ),
    first_seen_vote_date:
      (firstSeenResult.results?.[0]?.vote_date ? String(firstSeenResult.results[0].vote_date) : undefined) ??
      detail.history.first_seen_vote_date,
    last_comparable_vote: lastComparableVote ?? detail.history.last_comparable_vote,
    related_votes: relatedVotes.length > 0 ? relatedVotes : detail.history.related_votes,
  };
}

async function readJsonPayload<T>(result: D1Result<Record<string, unknown>>): Promise<T | null> {
  const row = result.results?.[0] as { payload_json?: string } | undefined;
  if (!row?.payload_json) return null;
  return JSON.parse(row.payload_json) as T;
}

export async function readLatestBriefingFromD1(db: D1Database): Promise<BriefingFeedResponse | null> {
  const result = await db
    .prepare("SELECT payload_json FROM daily_briefings WHERE briefing_key = ? LIMIT 1")
    .bind("latest")
    .all<Record<string, unknown>>();
  const payload = await readJsonPayload<BriefingFeedResponse>(result);
  if (!payload) return null;
  const items = await Promise.all(
    payload.items.map(async (item) => ({
      ...item,
      source_coverage: await readVoteSourceCoverage(db, item),
    }))
  );
  return {
    ...payload,
    source: "d1",
    items,
    coverage_note: items.some((item) => item.source_coverage.level !== "full")
      ? "Some votes currently have full vote data but partial contextual or excerpt coverage."
      : undefined,
  };
}

export async function readVoteDetailFromD1(
  db: D1Database,
  congress: number,
  session: number,
  voteNumber: number
): Promise<VoteDetailResponse | null> {
  const result = await db
    .prepare(
      "SELECT payload_json FROM vote_read_models WHERE congress = ? AND session = ? AND vote_number = ? LIMIT 1"
    )
    .bind(congress, session, voteNumber)
    .all<Record<string, unknown>>();
  const payload = await readJsonPayload<VoteDetailResponse>(result);
  if (!payload) return null;
  const [argumentsOverride, history, coverage] = await Promise.all([
    readOfficialArgumentsForVote(db, payload),
    readHistoricalContextForVote(db, payload),
    readVoteSourceCoverage(db, {
      congress: payload.vote.congress,
      session: payload.vote.session,
      vote_number: payload.vote.vote_number,
      source_coverage: payload.source_coverage,
    }),
  ]);
  return {
    ...payload,
    source: "d1",
    arguments: argumentsOverride ?? payload.arguments,
    history,
    source_coverage: coverage,
  };
}
