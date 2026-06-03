import { ensurePlatformSchema } from "../d1/schema";

let schemaReady: Promise<void> | null = null;

/** Ensures D1 platform tables exist once per isolate (local/test safety net). */
export function ensureSchemaOnce(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensurePlatformSchema(db).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Test-only: reset schema memoization between cases. */
export function resetSchemaOnceForTests(): void {
  schemaReady = null;
}
