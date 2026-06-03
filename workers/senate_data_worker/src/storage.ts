import type { MetaKeys } from "./types";

export interface StateKeyLayout extends MetaKeys {
  meta: string;
}

export interface MemberKeyLayout {
  latest: string;
  snapshot: string;
}

function normalizeState(state: string): string {
  return state.trim().toUpperCase();
}

function normalizeBioguide(bioguideId: string): string {
  return bioguideId.trim().toUpperCase();
}

export function buildLatestKey(state: string): string {
  return `state/${normalizeState(state)}/latest.json`;
}

export function buildSnapshotKey(state: string, voteDate: string): string {
  return `state/${normalizeState(state)}/${voteDate}.json`;
}

export function buildMetaKey(state: string): string {
  return `state/${normalizeState(state)}/_meta.json`;
}

export function buildStateKeys(state: string, voteDate: string): StateKeyLayout {
  return {
    latest: buildLatestKey(state),
    snapshot: buildSnapshotKey(state, voteDate),
    meta: buildMetaKey(state),
  };
}

export function buildMemberLatestKey(bioguideId: string): string {
  return `member/${normalizeBioguide(bioguideId)}/latest.json`;
}

export function buildMemberSnapshotKey(bioguideId: string, date: string): string {
  return `member/${normalizeBioguide(bioguideId)}/${date}.json`;
}

export function buildMemberKeys(
  bioguideId: string,
  date: string
): MemberKeyLayout {
  return {
    latest: buildMemberLatestKey(bioguideId),
    snapshot: buildMemberSnapshotKey(bioguideId, date),
  };
}

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

export function buildCoverageSnapshotKey(snapshotDate: string): string {
  return `stats/coverage/${snapshotDate}.json`;
}

export function buildLatestBriefingKey(): string {
  return "briefings/latest.json";
}

export function buildLatestChamberContextKey(): string {
  return "platform/context/chamber/latest.json";
}

export function buildChamberContextKey(snapshotDate: string): string {
  return `platform/context/chamber/${snapshotDate}.json`;
}

export function buildVoteDetailKey(
  congress: number,
  session: number,
  voteNumber: number
): string {
  return `votes/detail/${congress}/${session}/${voteNumber}.json`;
}
