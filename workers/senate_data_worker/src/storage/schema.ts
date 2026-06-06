// SCHEMA_REDESIGN: D1 tables are not created until the new data model lands.
const schemaReadyByDb = new WeakMap<D1Database, Promise<void>>();
const knownDatabases = new Set<D1Database>();

/** Schema alignment is intentionally disabled until the D1 model is redesigned. */
export function shouldRunLazySchemaAlignment(): boolean {
  return false;
}

/** No-op placeholder until a new D1 schema is introduced. */
export function ensureSchemaOnce(db: D1Database): Promise<void> {
  if (!shouldRunLazySchemaAlignment()) {
    return Promise.resolve();
  }

  knownDatabases.add(db);
  let ready = schemaReadyByDb.get(db);
  if (!ready) {
    ready = Promise.resolve();
    schemaReadyByDb.set(db, ready);
  }
  return ready;
}

/** Test-only: clear schema memoization (all known DBs when omitted). */
export function resetSchemaOnceForTests(db?: D1Database): void {
  if (db) {
    schemaReadyByDb.delete(db);
    knownDatabases.delete(db);
    return;
  }
  for (const known of knownDatabases) {
    schemaReadyByDb.delete(known);
  }
  knownDatabases.clear();
}
