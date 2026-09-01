import { maxIsoDay } from "../../../../shared/iso-day";

export type VoteDateWatermarkFields = {
  sourceLatestDate?: string;
  coveredLatestDate?: string;
};

export type VoteDateWatermarks = {
  noteListed(date: string | null | undefined): void;
  noteCovered(date: string | null | undefined): void;
  /** Menu rows that need no follow-up fetch: listed and covered are the same date. */
  noteListedAndCovered(date: string | null | undefined): void;
  toFields(): VoteDateWatermarkFields;
};

/** True when the source list/menu has a calendar day ingest never persisted or skipped-as-known. */
export function isSourceAheadOfCovered(
  sourceLatestDate: string | null | undefined,
  coveredLatestDate: string | null | undefined
): boolean {
  if (!sourceLatestDate) return false;
  return !coveredLatestDate || sourceLatestDate > coveredLatestDate;
}

/**
 * Running max of listed vs covered vote dates during a chamber ingest.
 * `toFields` omits empty dates so the ingest result stays sparse.
 */
export function createVoteDateWatermarks(): VoteDateWatermarks {
  let sourceLatestDate: string | null = null;
  let coveredLatestDate: string | null = null;
  const noteListed = (date: string | null | undefined) => {
    sourceLatestDate = maxIsoDay([sourceLatestDate, date]);
  };
  const noteCovered = (date: string | null | undefined) => {
    coveredLatestDate = maxIsoDay([coveredLatestDate, date]);
  };
  return {
    noteListed,
    noteCovered,
    noteListedAndCovered(date) {
      noteListed(date);
      noteCovered(date);
    },
    toFields() {
      return {
        ...(sourceLatestDate ? { sourceLatestDate } : {}),
        ...(coveredLatestDate ? { coveredLatestDate } : {}),
      };
    },
  };
}
