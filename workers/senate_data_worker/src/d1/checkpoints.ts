import { ensurePlatformSchema } from "./schema";

export interface PipelineCheckpointRecord<T = Record<string, unknown>> {
  checkpointKey: string;
  cursor: T;
  updatedAt: string;
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
