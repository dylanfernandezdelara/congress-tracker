export function buildMembersIndexKey(): string {
  return "members/index.json";
}

export function buildActivitiesIndexKey(): string {
  return "activities/index.json";
}

export function buildVoteLedgerKey(): string {
  return "votes/ledger.json";
}

export function buildSessionOverviewKey(): string {
  return "stats/overview.json";
}

export function buildBillEvidenceKey(billKey: string): string {
  return `bills/evidence/${billKey}.json`;
}

export function buildBillNarrativeKey(billKey: string): string {
  return `bills/narrative/${billKey}.json`;
}

export function buildBillTrendSnapshotKey(
  congress: number,
  billKey: string,
  snapshotDate: string
): string {
  return `bills/trends/${congress}/${billKey}/${snapshotDate}.json`;
}

export function buildLatestChamberContextKey(): string {
  return "platform/context/chamber/latest.json";
}

export function buildChamberContextKey(snapshotDate: string): string {
  return `platform/context/chamber/${snapshotDate}.json`;
}
