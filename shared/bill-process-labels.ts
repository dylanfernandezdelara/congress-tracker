/** Plain-English labels for committee process stages — worker + web. */

export type BillProcessActivityKey =
  | "sent"
  | "hearings"
  | "worked_on"
  | "advanced"
  | "released"
  | "interest"
  | "other";

/** Floor actions that committee activity names do not cover. */
export type BillFloorActionKey =
  | "received"
  | "calendar"
  | "considered"
  | "cloture"
  | "conference";

export type BillProcessCurrentStatus =
  | "introduced"
  | "in_committee"
  | "in_subcommittee"
  | "cleared_committee"
  | "in_second_chamber_committee"
  | "released_from_committee"
  | "unknown";

/** Normalize Congress.gov committee activity names into stable keys. */
export function normalizeCommitteeActivity(raw: string | null | undefined): BillProcessActivityKey {
  const name = (raw ?? "").trim().toLowerCase();
  if (!name) return "other";
  if (name.includes("interest")) return "interest";
  if (name.includes("hearing")) return "hearings";
  if (name.includes("markup") || name.includes("worked")) return "worked_on";
  if (name.includes("reported") || name.includes("forwarded")) return "advanced";
  if (name.includes("discharged")) return "released";
  if (name.includes("referred") || name.includes("committed")) return "sent";
  return "other";
}

export function activityVerb(key: BillProcessActivityKey): string {
  switch (key) {
    case "sent":
      return "Sent to";
    case "hearings":
      return "Committee held hearings in";
    case "worked_on":
      return "Committee worked on the bill in";
    case "advanced":
      return "Committee advanced the bill from";
    case "released":
      return "Released from";
    case "interest":
      return "Noted by";
    case "other":
      return "Update from";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function formatProcessStageLabel(params: {
  activityKey: BillProcessActivityKey;
  committeeName: string;
  parentCommitteeName?: string | null;
  tallyText?: string | null;
}): string {
  const committee = params.parentCommitteeName
    ? `${params.parentCommitteeName} → ${params.committeeName}`
    : params.committeeName;
  const base = `${activityVerb(params.activityKey)} ${committee}`;
  const tally = params.tallyText?.trim();
  return tally ? `${base} (${tally})` : base;
}

export function formatWaitingLabel(committeeName: string): string {
  return `In ${committeeName} · waiting for the committee to act`;
}

export function formatClearedLabel(committeeName: string): string {
  return `Cleared ${committeeName} · waiting for a chamber vote`;
}

export function formatReleasedLabel(committeeName: string): string {
  return `Released from ${committeeName}`;
}

export function formatFloorActionLabel(params: {
  key: BillFloorActionKey;
  chamber: "House" | "Senate" | null;
  tallyText?: string | null;
}): string {
  const chamber = params.chamber;
  let base: string;
  switch (params.key) {
    case "received":
      base = chamber ? `Received in the ${chamber}` : "Received in the other chamber";
      break;
    case "calendar":
      base = chamber ? `Placed on the ${chamber} calendar` : "Placed on the calendar";
      break;
    case "considered":
      base = chamber ? `Debated in the ${chamber}` : "Debated on the floor";
      break;
    case "cloture":
      base = "Cloture in the Senate";
      break;
    case "conference":
      base = "Conference committee";
      break;
    default: {
      const _exhaustive: never = params.key;
      return _exhaustive;
    }
  }
  const tally = params.tallyText?.trim();
  return tally ? `${base} (${tally})` : base;
}

/**
 * Strip common "Committee" suffix noise for compact chips while keeping
 * recognizable names (Energy & Commerce, HELP, etc.).
 */
export function shortCommitteeName(name: string): string {
  return name.replace(/\s+Committee$/i, "").trim() || name;
}

/** Compact feed-row chip from structured status — do not parse current_label prose. */
export function formatProcessChipLabel(
  status: BillProcessCurrentStatus,
  committeeName: string | null | undefined
): string | null {
  const trimmed = committeeName?.trim();
  const short = trimmed ? shortCommitteeName(trimmed) : null;
  switch (status) {
    case "in_committee":
    case "in_subcommittee":
    case "in_second_chamber_committee":
      return short ? `In ${short}` : "In committee";
    case "cleared_committee":
      return short ? `Cleared ${short}` : "Cleared committee";
    case "introduced":
    case "released_from_committee":
    case "unknown":
      return null;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
