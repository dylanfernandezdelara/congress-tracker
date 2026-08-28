import type { BillProcessSummary, BillProcessStage, BillFloorAction } from "../../../../shared/bill-process-api-types";
import type { FeedChamber } from "../../../../shared/feed-api-types";
import {
  formatClearedLabel,
  formatProcessStageLabel,
  formatReleasedLabel,
  formatWaitingLabel,
  type BillProcessCurrentStatus,
} from "../../../../shared/bill-process-labels";
import type { ProcessCommitteeEvent, ProcessFloorEvent } from "./types";

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
  current_status: BillProcessCurrentStatus;
  current_label: string | null;
  stages: BillProcessStage[];
} {
  const origin = originChamberFromBillType(billType);
  const stages = eventsToStages(events, nameByCode);
  let current_status: BillProcessCurrentStatus = "introduced";
  let current_label: string | null = null;

  if (events.length > 0) {
    const latest = [...events].sort((a, b) => b.activityAt.localeCompare(a.activityAt))[0]!;
    const latestMeaningful =
      [...events]
        .filter((e) => e.activityKey !== "interest" && e.activityKey !== "other")
        .sort((a, b) => b.activityAt.localeCompare(a.activityAt))[0] ?? latest;

    const inSecondChamber =
      origin != null &&
      latestMeaningful.chamber != null &&
      latestMeaningful.chamber !== origin;

    switch (latestMeaningful.activityKey) {
      case "released":
        current_status = "released_from_committee";
        current_label = formatReleasedLabel(latestMeaningful.committeeName);
        break;
      case "advanced":
        if (latestMeaningful.parentSystemCode) {
          const parentName =
            nameByCode.get(latestMeaningful.parentSystemCode) ?? "the full committee";
          current_status = inSecondChamber
            ? "in_second_chamber_committee"
            : "in_subcommittee";
          current_label = `Cleared ${latestMeaningful.committeeName} · waiting on ${parentName}`;
        } else {
          current_status = "cleared_committee";
          current_label = formatClearedLabel(latestMeaningful.committeeName);
        }
        break;
      case "sent":
      case "hearings":
      case "worked_on":
        current_status = latestMeaningful.parentSystemCode
          ? "in_subcommittee"
          : "in_committee";
        if (inSecondChamber) current_status = "in_second_chamber_committee";
        current_label = formatWaitingLabel(latestMeaningful.committeeName);
        break;
      case "interest":
      case "other":
        current_status = "unknown";
        break;
      default: {
        const _exhaustive: never = latestMeaningful.activityKey;
        void _exhaustive;
        current_status = "unknown";
      }
    }
  }

  return { current_status, current_label, stages };
}

export function floorEventsToActions(events: ProcessFloorEvent[]): BillFloorAction[] {
  const sorted = [...events].sort((a, b) => a.actionAt.localeCompare(b.actionAt));
  return sorted.map((e) => ({
    date: dateOnly(e.actionAt),
    key: e.actionKey,
    label: e.label,
    chamber: e.chamber,
    tally_text: e.tallyText,
  }));
}

export function toProcessSummary(
  billType: string,
  events: ProcessCommitteeEvent[],
  nameByCode?: Map<string, string>,
  floorEvents: ProcessFloorEvent[] = []
): BillProcessSummary | null {
  if (events.length === 0 && floorEvents.length === 0) return null;
  const derived = deriveProcessState(billType, events, nameByCode);
  const floor_actions = floorEventsToActions(floorEvents);
  return {
    current_status: derived.current_status,
    current_label: derived.current_label,
    stages: derived.stages,
    ...(floor_actions.length > 0 ? { floor_actions } : {}),
  };
}
