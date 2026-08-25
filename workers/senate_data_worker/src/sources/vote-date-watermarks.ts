import { maxIsoDay } from "../../../../shared/floor-quiet";

export type VoteDateWatermarks = {
  noteListed(date: string | null | undefined): void;
  noteCovered(date: string | null | undefined): void;
  toFields(): { sourceLatestDate?: string; coveredLatestDate?: string };
};

/**
 * Running max of listed vs covered vote dates during a chamber ingest.
 * `toFields` omits empty dates so the ingest result stays sparse.
 */
export function createVoteDateWatermarks(): VoteDateWatermarks {
  let sourceLatestDate: string | null = null;
  let coveredLatestDate: string | null = null;
  return {
    noteListed(date) {
      sourceLatestDate = maxIsoDay([sourceLatestDate, date]);
    },
    noteCovered(date) {
      coveredLatestDate = maxIsoDay([coveredLatestDate, date]);
    },
    toFields() {
      return {
        ...(sourceLatestDate ? { sourceLatestDate } : {}),
        ...(coveredLatestDate ? { coveredLatestDate } : {}),
      };
    },
  };
}
