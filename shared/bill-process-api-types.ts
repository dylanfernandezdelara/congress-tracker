/** Shared JSON contracts for bill committee-process timelines. */

import type {
  BillFloorActionKey,
  BillProcessActivityKey,
  BillProcessCurrentStatus,
} from "./bill-process-labels";
import type { FeedChamber } from "./feed-api-types";

export interface BillProcessStage {
  /** ISO date (YYYY-MM-DD) when known. */
  date: string | null;
  /** Plain-English stage line. */
  label: string;
  activity_key: BillProcessActivityKey;
  chamber: FeedChamber | null;
  committee_name: string;
  system_code: string;
  parent_system_code: string | null;
  /** True when this stage is a subcommittee. */
  is_subcommittee: boolean;
  tally_text: string | null;
}

/** Floor/calendar/cloture/conference actions from Congress.gov `/actions`. */
export interface BillFloorAction {
  date: string | null;
  key: BillFloorActionKey;
  label: string;
  chamber: FeedChamber | null;
  tally_text: string | null;
}

export interface BillProcessSummary {
  current_status: BillProcessCurrentStatus;
  /** Plain-English current-state chip / subtitle. */
  current_label: string | null;
  stages: BillProcessStage[];
  /** Non-committee legislative actions. Omitted when empty. */
  floor_actions?: BillFloorAction[];
}
