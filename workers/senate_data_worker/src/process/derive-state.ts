import type { BillProcessSummary, BillProcessStage } from "../../../../shared/bill-process-api-types";
import type { FeedChamber } from "../../../../shared/feed-api-types";
import {
  formatClearedLabel,
  formatProcessStageLabel,
  formatReleasedLabel,
  formatWaitingLabel,
  isAdvancementActivity,
  type BillProcessCurrentStatus,
} from "../../../../shared/bill-process-labels";
import type { ProcessCommitteeEvent } from "./types";

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
  events: ProcessCommitteeEvent[],
  nameByCode: Map<string, string>
): BillProcessStage[] {
  const usable = events.filter(
    (e) =>
      e.activityKey === "sent" ||
      e.activityKey === "hearings" ||
      e.activityKey === "worked_on" ||
      e.activityKey === "advanced" ||
      e.activityKey === "released"
  );
  usable.sort((a, b) => a.activityAt.localeCompare(b.activityAt));

  return usable.map((e) => {
    const parentName = e.parentSystemCode
      ? nameByCode.get(e.parentSystemCode) ?? null
      : null;
    return {
      date: dateOnly(e.activityAt),
      label: formatProcessStageLabel({
        activityKey: e.activityKey,
        committeeName: e.committeeName,
        parentCommitteeName: parentName,
        tallyText: e.tallyText,
      }),
      activity_key: e.activityKey,
      chamber: e.chamber,
      committee_name: e.committeeName,
      system_code: e.systemCode,
      parent_system_code: e.parentSystemCode,
      is_subcommittee: Boolean(e.parentSystemCode),
      tally_text: e.tallyText,
    };
  });
}

export function deriveProcessState(
  billType: string,
  events: ProcessCommitteeEvent[],
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
    if (!isAdvancementActivity(e.activityKey)) continue;
    if (!lastAdvanceAt || e.activityAt > lastAdvanceAt) lastAdvanceAt = e.activityAt;
  }

  if (events.length === 0) {
    return {
      origin_chamber: origin,
      current_status: "introduced",
      current_label: null,
      last_advance_at: null,
      stages,
    };
  }

  const latest = [...events].sort((a, b) => b.activityAt.localeCompare(a.activityAt))[0]!;

  // Prefer latest non-interest event for "where is it now?"
  const latestMeaningful =
    [...events]
      .filter((e) => e.activityKey !== "interest" && e.activityKey !== "other")
      .sort((a, b) => b.activityAt.localeCompare(a.activityAt))[0] ?? latest;

  const inSecondChamber =
    origin != null &&
    latestMeaningful.chamber != null &&
    latestMeaningful.chamber !== origin;

  if (latestMeaningful.activityKey === "released") {
    return {
      origin_chamber: origin,
      current_status: "released_from_committee",
      current_label: formatReleasedLabel(latestMeaningful.committeeName),
      last_advance_at: lastAdvanceAt,
      stages,
    };
  }

  if (latestMeaningful.activityKey === "advanced") {
    // If still only advanced from a subcommittee, waiting on parent / chamber.
    if (latestMeaningful.parentSystemCode) {
      const parentName =
        nameByCode.get(latestMeaningful.parentSystemCode) ?? "the full committee";
      return {
        origin_chamber: origin,
        current_status: inSecondChamber
          ? "in_second_chamber_committee"
          : "in_subcommittee",
        current_label: `Cleared ${latestMeaningful.committeeName} · waiting on ${parentName}`,
        last_advance_at: lastAdvanceAt,
        stages,
      };
    }
    return {
      origin_chamber: origin,
      current_status: "cleared_committee",
      current_label: formatClearedLabel(latestMeaningful.committeeName),
      last_advance_at: lastAdvanceAt,
      stages,
    };
  }

  if (
    latestMeaningful.activityKey === "sent" ||
    latestMeaningful.activityKey === "hearings" ||
    latestMeaningful.activityKey === "worked_on"
  ) {
    let status: BillProcessCurrentStatus = latestMeaningful.parentSystemCode
      ? "in_subcommittee"
      : "in_committee";
    if (inSecondChamber) status = "in_second_chamber_committee";
    return {
      origin_chamber: origin,
      current_status: status,
      current_label: formatWaitingLabel(latestMeaningful.committeeName),
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
  events: ProcessCommitteeEvent[],
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
