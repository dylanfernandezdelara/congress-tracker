import type { BillLifecycle } from "../../../../shared/lifecycle-api-types";
import type { LifecycleRow } from "../d1/lifecycle";
import { deriveTenDayRule } from "./derive-ten-day";

export function lifecycleRowToApi(
  row: LifecycleRow,
  now: Date | string = new Date()
): BillLifecycle {
  return {
    introduced_date: row.introduced_date,
    presented_date: row.presented_date,
    signed_date: row.signed_date,
    vetoed_date: row.vetoed_date,
    became_law_date: row.became_law_date,
    law_kind: row.law_kind,
    public_law: row.public_law,
    latest_action_date: row.latest_action_date,
    latest_action_text: row.latest_action_text,
    derived: deriveTenDayRule({
      presentedDate: row.presented_date,
      signedDate: row.signed_date,
      vetoedDate: row.vetoed_date,
      becameLawDate: row.became_law_date,
      now,
    }),
  };
}
