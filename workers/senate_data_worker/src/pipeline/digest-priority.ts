import {
  digestMapKey,
  parseStoredDigest,
  type DigestRow,
} from "../d1/digests";

export type DigestPriorityBill = {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
};

/**
 * Put bills without a complete digest first so DIGEST_MAX_NEW_REWRITES
 * is spent on placeholders (intros, CRS-less resolutions) before any
 * optional refresh of rows that already have headline + what_it_does.
 */
export function orderBillsMissingDigestFirst<T extends DigestPriorityBill>(
  bills: T[],
  digestByKey: ReadonlyMap<string, DigestRow | null>
): T[] {
  const missing: T[] = [];
  const complete: T[] = [];
  for (const bill of bills) {
    const row = digestByKey.get(
      digestMapKey(bill.bill_congress, bill.bill_type, bill.bill_number)
    );
    if (parseStoredDigest(row?.digest_json ?? null)) {
      complete.push(bill);
    } else {
      missing.push(bill);
    }
  }
  return [...missing, ...complete];
}
