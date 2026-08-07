import type { Env } from "../config";
import { replaceBillSponsors, type BillSponsorRecord } from "../d1/sponsors";
import type { BillRef } from "../types";

/** Persist primary sponsors from a Congress.gov bill bundle (no-op if empty). */
export async function persistBillSponsors(
  env: Env,
  bill: BillRef,
  sponsors: BillSponsorRecord[]
): Promise<void> {
  await replaceBillSponsors(env.DB, bill.congress, bill.type, bill.number, sponsors);
}
