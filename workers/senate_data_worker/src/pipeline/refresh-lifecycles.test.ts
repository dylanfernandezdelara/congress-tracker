import { describe, expect, it } from "vitest";
import type { LifecycleRow } from "../d1/lifecycle";
import { lifecycleRefreshPriority } from "./refresh-lifecycles";

function row(partial: Partial<LifecycleRow>): LifecycleRow {
  return {
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    introduced_date: null,
    presented_date: null,
    signed_date: null,
    vetoed_date: null,
    became_law_date: null,
    law_kind: null,
    public_law: null,
    latest_action_date: null,
    latest_action_text: null,
    updated_at: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("lifecycleRefreshPriority", () => {
  it("prefers never-refreshed bills, then presidential-tracking, then the rest", () => {
    expect(lifecycleRefreshPriority(undefined)).toBe(0);
    expect(lifecycleRefreshPriority(row({ presented_date: "2026-06-29" }))).toBe(1);
    expect(lifecycleRefreshPriority(row({ vetoed_date: "2026-05-01", law_kind: "vetoed" }))).toBe(
      1
    );
    expect(lifecycleRefreshPriority(row({ introduced_date: "2026-01-01" }))).toBe(2);
  });
});
