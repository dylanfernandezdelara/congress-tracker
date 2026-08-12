import type { BillProcessSummary, BillProcessStage } from "../../../../shared/bill-process-api-types";
import type { FeedChamber } from "../../../../shared/feed-api-types";
import {
  formatClearedLabel,
  formatProcessStageLabel,
  formatReleasedLabel,
  formatWaitingLabel,
  isAdvancementActivity,
  type BillProcessActivityKey,
  type BillProcessCurrentStatus,
} from "../../../../shared/bill-process-labels";

export interface CommitteeEventRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  system_code: string;
  activity_key: BillProcessActivityKey;
  activity_at: string;
  chamber: FeedChamber;
  committee_name: string;
  parent_system_code: string | null;
  activity_raw: string;
  tally_text: string | null;
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function originChamberFromBillType(billType: string): FeedChamber | null {
  const t = billType.toUpperCase();
  if (t.startsWith("H")) return "House";
  if (t.startsWith("S")) return "Senate";
  return null;
}

/** Timeline stages: skip interest/other noise; keep sent/hearings/work/advance/release. */
export function eventsToStages(
  events: CommitteeEventRow[],
  nameByCode: Map<string, string>
): BillProcessStage[] {
  const usable = events.filter(
    (e) =>
      e.activity_key === "sent" ||
      e.activity_key === "hearings" ||
      e.activity_key === "worked_on" ||
      e.activity_key === "advanced" ||
      e.activity_key === "released"
  );
  usable.sort((a, b) => a.activity_at.localeCompare(b.activity_at));

  return usable.map((e) => {
    const parentName = e.parent_system_code
      ? nameByCode.get(e.parent_system_code) ?? null
      : null;
    return {
      date: dateOnly(e.activity_at),
      label: formatProcessStageLabel({
        activityKey: e.activity_key,
        committeeName: e.committee_name,
        parentCommitteeName: parentName,
        tallyText: e.tally_text,
      }),
      activity_key: e.activity_key,
      chamber: e.chamber,
      committee_name: e.committee_name,
      system_code: e.system_code,
      parent_system_code: e.parent_system_code,
      is_subcommittee: Boolean(e.parent_system_code),
      tally_text: e.tally_text,
    };
  });
}

export function deriveProcessState(
  billType: string,
  events: CommitteeEventRow[],
  nameByCode: Map<string, string> = new Map()
): {
  origin_chamber: FeedChamber | null;
  current_status: BillProcessCurrentStatus;
  current_label: string | null;
  last_advance_at: string | null;
  stages: BillProcessStage[];
} {
  const origin = originChamberFromBillType(billType);
  const stages = eventsToStages(events, nameByCode);
  let lastAdvanceAt: string | null = null;
  for (const e of events) {
    if (!isAdvancementActivity(e.activity_key)) continue;
    if (!lastAdvanceAt || e.activity_at > lastAdvanceAt) lastAdvanceAt = e.activity_at;
  }

  if (events.length === 0) {
    return {
      origin_chamber: origin,
      current_status: "unknown",
      current_label: null,
      last_advance_at: null,
      stages,
    };
  }

  const latest = [...events].sort((a, b) => b.activity_at.localeCompare(a.activity_at))[0]!;

  // Prefer latest non-interest event for "where is it now?"
  const latestMeaningful =
    [...events]
      .filter((e) => e.activity_key !== "interest" && e.activity_key !== "other")
      .sort((a, b) => b.activity_at.localeCompare(a.activity_at))[0] ?? latest;

  if (latestMeaningful.activity_key === "released") {
    return {
      origin_chamber: origin,
      current_status: "released_from_committee",
      current_label: formatReleasedLabel(latestMeaningful.committee_name),
      last_advance_at: lastAdvanceAt,
      stages,
    };
  }

  if (latestMeaningful.activity_key === "advanced") {
    // If still only advanced from a subcommittee, waiting on parent / chamber.
    if (latestMeaningful.parent_system_code) {
      const parentName =
        nameByCode.get(latestMeaningful.parent_system_code) ?? "the full committee";
      return {
        origin_chamber: origin,
        current_status: "in_subcommittee",
        current_label: `Cleared ${latestMeaningful.committee_name} · waiting on ${parentName}`,
        last_advance_at: lastAdvanceAt,
        stages,
      };
    }
    return {
      origin_chamber: origin,
      current_status: "cleared_committee",
      current_label: formatClearedLabel(latestMeaningful.committee_name),
      last_advance_at: lastAdvanceAt,
      stages,
    };
  }

  if (
    latestMeaningful.activity_key === "sent" ||
    latestMeaningful.activity_key === "hearings" ||
    latestMeaningful.activity_key === "worked_on"
  ) {
    const status: BillProcessCurrentStatus = latestMeaningful.parent_system_code
      ? "in_subcommittee"
      : "in_committee";
    return {
      origin_chamber: origin,
      current_status: status,
      current_label: formatWaitingLabel(latestMeaningful.committee_name),
      last_advance_at: lastAdvanceAt,
      stages,
    };
  }

  return {
    origin_chamber: origin,
    current_status: "unknown",
    current_label: null,
    last_advance_at: lastAdvanceAt,
    stages,
  };
}

export function toProcessSummary(
  billType: string,
  events: CommitteeEventRow[],
  nameByCode?: Map<string, string>
): BillProcessSummary | null {
  if (events.length === 0) return null;
  const derived = deriveProcessState(billType, events, nameByCode);
  return {
    origin_chamber: derived.origin_chamber,
    current_status: derived.current_status,
    current_label: derived.current_label,
    last_advance_at: derived.last_advance_at,
    stages: derived.stages,
  };
}
