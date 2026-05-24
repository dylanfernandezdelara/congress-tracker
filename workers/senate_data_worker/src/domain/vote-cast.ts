import type { VoteCast } from "../platform-types";

export function classifyVote(raw: string | undefined): VoteCast {
  const lc = (raw ?? "").trim().toLowerCase();
  if (lc.includes("yea") || lc.includes("aye") || lc === "yes") return "yea";
  if (lc.includes("nay") || lc === "no") return "nay";
  if (lc.includes("present")) return "present";
  return "notVoting";
}

export function isYeaOrNayCast(raw: string | undefined): boolean {
  const cast = classifyVote(raw);
  return cast === "yea" || cast === "nay";
}
