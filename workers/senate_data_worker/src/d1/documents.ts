import { ensurePlatformSchema } from "./schema";

export interface DocumentWriteOptions {
  skipIfUnchanged?: boolean;
  jsonVolatileKeys?: string[];
}

const DEFAULT_JSON_VOLATILE_KEYS = new Set(["generated_at", "run_id"]);

function normalizeJsonForComparison(
  value: unknown,
  volatileKeys: ReadonlySet<string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonForComparison(item, volatileKeys));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (volatileKeys.has(key)) continue;
    normalized[key] = normalizeJsonForComparison(
      (value as Record<string, unknown>)[key],
      volatileKeys
    );
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (!value || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function equivalentJsonPayloads(
  current: string,
  next: string,
  volatileKeys: ReadonlySet<string>
): boolean {
  try {
    const currentNormalized = normalizeJsonForComparison(JSON.parse(current), volatileKeys);
    const nextNormalized = normalizeJsonForComparison(JSON.parse(next), volatileKeys);
    return stableStringify(currentNormalized) === stableStringify(nextNormalized);
  } catch {
    return current === next;
  }
}

export async function readDocumentJson<T>(db: D1Database, key: string): Promise<T | null> {
  await ensurePlatformSchema(db);
  const result = await db
    .prepare("SELECT body FROM kv_documents WHERE doc_key = ? LIMIT 1")
    .bind(key)
    .all<{ body: string }>();
  const body = result.results?.[0]?.body;
  if (!body?.trim()) {
    return null;
  }
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    console.error(
      `[d1] Invalid JSON in kv_documents for ${key}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export async function writeDocumentJson(
  db: D1Database,
  key: string,
  value: unknown,
  options: DocumentWriteOptions = {}
): Promise<void> {
  await ensurePlatformSchema(db);
  const body = JSON.stringify(value);
  const contentType = "application/json";
  const updatedAt = new Date().toISOString();

  if (options.skipIfUnchanged) {
    const current = await db
      .prepare("SELECT body FROM kv_documents WHERE doc_key = ? LIMIT 1")
      .bind(key)
      .all<{ body: string }>();
    const currentBody = current.results?.[0]?.body;
    if (currentBody) {
      const volatileKeys = new Set([
        ...(options.jsonVolatileKeys ?? []),
        ...DEFAULT_JSON_VOLATILE_KEYS,
      ]);
      if (equivalentJsonPayloads(currentBody, body, volatileKeys)) {
        console.log(`[d1] Skipped unchanged ${key}`);
        return;
      }
    }
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO kv_documents (doc_key, content_type, body, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(key, contentType, body, updatedAt)
    .run();
  console.log(`[d1] Wrote ${key} (${body.length} bytes)`);
}

export async function deleteDocument(db: D1Database, key: string): Promise<void> {
  await ensurePlatformSchema(db);
  await db.prepare("DELETE FROM kv_documents WHERE doc_key = ?").bind(key).run();
}
