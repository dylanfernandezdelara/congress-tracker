import type { VoteStatus } from "../platform-types";

export function isPassed(result: string): boolean {
  const lc = result.toLowerCase();
  if (/failed|rejected|not agreed|not passed|disagreed|not invoked|not confirmed/.test(lc)) {
    return false;
  }
  return /agreed to|agreed|passed|confirmed|invoked|adopted|approved/.test(lc);
}

export function toStatus(result: string): VoteStatus {
  return isPassed(result) ? "passed" : "rejected";
}

export function normalizeVoteStatus(result: string): VoteStatus {
  const normalized = result.toLowerCase();
  if (/failed|rejected|not agreed|not passed|disagreed|not invoked|not confirmed/.test(normalized)) {
    return "rejected";
  }
  return /agreed to|agreed|passed|confirmed|invoked|adopted|approved/.test(normalized)
    ? "passed"
    : "rejected";
}
