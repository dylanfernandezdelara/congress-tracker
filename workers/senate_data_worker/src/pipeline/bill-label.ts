import { formatBillDocket } from "../../../../shared/feed-content";

export function billLabel(type: string, number: number, congress: number): string {
  return formatBillDocket(type, number, congress);
}
