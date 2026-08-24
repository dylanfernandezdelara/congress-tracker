import { containsLocalSampleLabel, stripLocalSampleLabel } from "../../../../shared/bill-id";
import type { Env } from "../config";
import { getDigest, parseStoredDigest, upsertDigest } from "../d1/digests";
import {
  getLifecyclesForBills,
  lifecycleMapKey,
  upsertLifecycle,
  type LifecycleBillRow,
} from "../d1/lifecycle";
import type { PublicLawRecord } from "../sources/public-laws";
import { billLabel } from "./bill-label";

export interface PersistPublicLawsResult {
  listed: number;
  upserted: number;
  titlesWritten: number;
  warnings: string[];
}

function stripSampleLabelsFromDigestJson(json: string | null): string | null {
  const parsed = parseStoredDigest(json);
  if (!parsed) return json;
  if (!containsLocalSampleLabel(parsed.headline)) return json;
  const headline = stripLocalSampleLabel(parsed.headline);
  if (!headline) return json;
  return JSON.stringify({ ...parsed, headline });
}

export function publicLawsToBillRows(laws: PublicLawRecord[]): LifecycleBillRow[] {
  return laws.map((law) => ({
    bill_congress: law.congress,
    bill_type: law.billType,
    bill_number: law.billNumber,
  }));
}

/**
 * Write Congress.gov public-law rows that the vote-lookback refresh missed.
 * Existing enacted lifecycle rows are left intact (COALESCE cannot restore a
 * blanked `law_kind`). Titles are repaired when the digest is missing or still
 * labeled as local sample data.
 */
export async function persistPublicLaws(
  env: Env,
  laws: PublicLawRecord[],
  trigger: string
): Promise<PersistPublicLawsResult> {
  let upserted = 0;
  let titlesWritten = 0;
  const warnings: string[] = [];

  const existing = await getLifecyclesForBills(
    env.DB,
    laws.map((law) => ({
      congress: law.congress,
      billType: law.billType,
      billNumber: law.billNumber,
    }))
  );

  for (const law of laws) {
    const label = billLabel(law.billType, law.billNumber, law.congress);
    const stored = existing.get(lifecycleMapKey(law.congress, law.billType, law.billNumber));
    if (!stored?.became_law_date) {
      try {
        const m = law.milestones;
        await upsertLifecycle(env.DB, {
          congress: law.congress,
          billType: law.billType,
          billNumber: law.billNumber,
          introducedDate: null,
          presentedDate: m.presented_date,
          signedDate: m.signed_date,
          vetoedDate: m.vetoed_date,
          becameLawDate: m.became_law_date ?? law.becameLawDate,
          lawKind: m.law_kind,
          publicLaw: m.public_law ?? law.publicLaw,
          latestActionDate: m.latest_action_date ?? law.becameLawDate,
          latestActionText: m.latest_action_text ?? law.latestActionText,
        });
        upserted += 1;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`${label}: ${message}`);
        console.warn(
          JSON.stringify({
            event: "public_law_lifecycle_upsert_failed",
            trigger,
            bill: label,
            error: message,
          })
        );
      }
    }

    if (!law.title) continue;
    try {
      const digestRow = await getDigest(env.DB, law.congress, law.billType, law.billNumber);
      const digest = parseStoredDigest(digestRow?.digest_json ?? null);
      const cleanedDigestJson = stripSampleLabelsFromDigestJson(digestRow?.digest_json ?? null);
      const needsTitle =
        !digestRow ||
        containsLocalSampleLabel(digestRow.title) ||
        containsLocalSampleLabel(digest?.headline);
      if (!needsTitle) continue;

      await upsertDigest(env.DB, {
        congress: law.congress,
        billType: law.billType,
        number: law.billNumber,
        title: law.title,
        policyArea: digestRow?.policy_area ?? null,
        rawSummaryText: digestRow?.raw_summary_text ?? null,
        digest: null,
        preserveDigestJson: cleanedDigestJson,
      });
      titlesWritten += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`${label}: ${message}`);
      console.warn(
        JSON.stringify({
          event: "public_law_digest_title_failed",
          trigger,
          bill: label,
          error: message,
        })
      );
    }
  }

  return {
    listed: laws.length,
    upserted,
    titlesWritten,
    warnings,
  };
}
