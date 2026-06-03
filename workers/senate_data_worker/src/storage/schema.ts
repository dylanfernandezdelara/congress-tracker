import { ensurePlatformSchema } from "../d1/schema";

const schemaReadyByDb = new WeakMap<D1Database, Promise<void>>();
const knownDatabases = new Set<D1Database>();

/**
 * Local/test lazy schema alignment. Production should rely on applied D1 migrations;
 * this remains a safety net for Wrangler dev, Vitest, and the deterministic harness.
 */
export function shouldRunLazySchemaAlignment(): boolean {
  return true;
}

/** Ensures D1 platform tables exist once per database per isolate. */
export function ensureSchemaOnce(db: D1Database): Promise<void> {
  if (!shouldRunLazySchemaAlignment()) {
    return Promise.resolve();
  }

  knownDatabases.add(db);
  let ready = schemaReadyByDb.get(db);
  if (!ready) {
    ready = ensurePlatformSchema(db).catch((error) => {
      schemaReadyByDb.delete(db);
      throw error;
    });
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
