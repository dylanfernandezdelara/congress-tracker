import { ensureSchemaOnce } from "../storage/schema";

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

export async function recordSourceFetchLog(
  db: D1Database,
  record: SourceFetchLogRecord
): Promise<void> {
  await ensureSchemaOnce(db);
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
  await ensureSchemaOnce(db);
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
