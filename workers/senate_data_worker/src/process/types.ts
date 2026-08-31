import type {
  BillFloorActionKey,
  BillProcessActivityKey,
} from "../../../../shared/bill-process-labels";
import type { FeedChamber } from "../../../../shared/feed-api-types";

/** Canonical committee-event write shape (process layer → D1 edge). */
export interface ProcessCommitteeEvent {
  congress: number;
  billType: string;
  billNumber: number;
  systemCode: string;
  activityKey: BillProcessActivityKey;
  activityAt: string;
  chamber: FeedChamber;
  committeeName: string;
  parentSystemCode: string | null;
  activityRaw: string;
  tallyText: string | null;
}

/** Canonical floor-action write shape (process layer → D1 edge). */
export interface ProcessFloorEvent {
  congress: number;
  billType: string;
  billNumber: number;
  actionKey: BillFloorActionKey;
  actionAt: string;
  chamber: FeedChamber;
  label: string;
  rawText: string;
  tallyText: string | null;
}
