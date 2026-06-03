import { deleteDocument, readDocumentJson, writeDocumentJson } from "../storage/documents";
import { buildBillNarrativeKey } from "../storage";
import type { BillAnalysis } from "../types";
import type { BillAnalysisCacheMap } from "./types-shared";

export const LEGACY_BILL_ANALYSIS_CACHE_KEY = "analysis/bill-analysis-cache.json";

const migrationDoneByDb = new WeakMap<D1Database, boolean>();

/** Copies bundled analysis entries into per-bill narrative keys, then removes the bundle. */
export async function migrateLegacyBillAnalysisBundle(db: D1Database): Promise<number> {
  if (migrationDoneByDb.get(db)) return 0;
  migrationDoneByDb.set(db, true);

  const bundled = await readDocumentJson<BillAnalysisCacheMap>(db, LEGACY_BILL_ANALYSIS_CACHE_KEY);
  if (!bundled || Object.keys(bundled).length === 0) {
    return 0;
  }

  let migrated = 0;
  for (const [billKey, analysis] of Object.entries(bundled)) {
    if (!analysis || typeof analysis !== "object") continue;
    const narrativeKey = buildBillNarrativeKey(billKey);
    const existing = await readDocumentJson<BillAnalysis>(db, narrativeKey);
    if (!existing) {
      await writeDocumentJson(db, narrativeKey, analysis);
      migrated += 1;
    }
  }

  await deleteDocument(db, LEGACY_BILL_ANALYSIS_CACHE_KEY);
  if (migrated > 0) {
    console.log(`[synthesis] Migrated ${migrated} bill analyses from legacy bundle to narrative keys`);
  }
  return migrated;
}
