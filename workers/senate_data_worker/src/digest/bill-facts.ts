import { parseLifecycleActions, type CongressAction, type CongressLaw } from "../lifecycle/parse-actions";
import type { BillRef } from "../types";
import type { DigestBillInput, DigestVote } from "./prompt";

/*
 * A bill's status and floor record, read from its own Congress.gov actions: the complete record for any bill,
 * whenever it moved. The Library of Congress writes one standard summary action per chamber outcome:
 *   "Passed/agreed to in House: On motion to suspend the rules and pass the bill Agreed to by the Yeas and Nays: (2/3 required): 378 - 10 (Roll no. 290)."
 *   "Passed/agreed to in Senate: Submitted in the Senate, considered, and agreed to without amendment … by Unanimous Consent."
 *   "Failed of passage/not agreed to in House: On motion to suspend the rules and pass the bill Failed by the Yeas and Nays: (2/3 required): 250 - 170 (Roll no. 221)."
 * Every passage counts, including voice votes and unanimous consent, which never produce a roll call.
 */

const OUTCOME_RE = /^(Passed\/agreed to|Failed of passage\/not agreed to) in (House|Senate):?\s*(.*)$/i;
const RESOLVING_RE = /^Resolving differences -- (House|Senate) actions:\s*(.*)$/i;
/**
 * Tallies only in their exact vote wording, never any "N - N" (Congressional Record pages read "CR S8-500"):
 * House "by the Yeas and Nays: (2/3 required): 378 - 10 (Roll no. 290)" or "by recorded vote: 215 - 210 (Roll no. 99)";
 * Senate "by Yea-Nay Vote. 61 - 37. Record Vote Number: 224."
 */
const TALLY_RE = /(?:by the Yeas and Nays|by recorded vote|Yea-Nay Vote)[.:]?\s*(?:\(2\/3 required\):\s*)?(\d{1,3})\s*-\s*(\d{1,3})/i;
const UNANIMOUS_RE = /unanimous consent|without objection/i;
const VOICE_RE = /voice vote/i;

export type BillStage = DigestBillInput["status"]["stage"];

export interface BillFacts {
  status: DigestBillInput["status"];
  /** Chamber outcomes in date order, oldest first. */
  votes: DigestVote[];
}

function dateOf(action: CongressAction): string | null {
  return action.actionDate?.slice(0, 10) ?? null;
}

function how(detail: string, action: CongressAction): DigestVote["how"] {
  if (action.recordedVotes?.length || TALLY_RE.test(detail)) return "roll_call";
  if (UNANIMOUS_RE.test(detail)) return "unanimous_consent";
  if (VOICE_RE.test(detail)) return "voice";
  return "other";
}

function voteFrom(chamber: "House" | "Senate", passed: boolean, detail: string, action: CongressAction): DigestVote {
  const method = how(detail, action);
  const tally = method === "roll_call" ? detail.match(TALLY_RE) : null;
  return {
    chamber,
    vote_date: dateOf(action),
    question: detail.replace(/\s+/g, " ").trim().slice(0, 300) || null,
    result: passed ? "Passed" : "Failed",
    yeas: tally ? Number(tally[1]) : null,
    nays: tally ? Number(tally[2]) : null,
    how: method,
  };
}

const isSimpleResolution = (type: string) => /^(HRES|SRES)$/i.test(type);
const originChamber = (type: string): "House" | "Senate" => (/^S/i.test(type) ? "Senate" : "House");

/** Status and floor record from a bill's Congress.gov actions and its structured `laws` list. */
export function billFactsFromActions(
  ref: BillRef,
  actions: CongressAction[],
  laws?: CongressLaw[] | null
): BillFacts {
  const sorted = [...actions].sort((a, b) => (dateOf(a) ?? "").localeCompare(dateOf(b) ?? ""));
  const votes: DigestVote[] = [];
  for (const action of sorted) {
    const text = action.text?.trim() ?? "";
    const outcome = text.match(OUTCOME_RE);
    if (outcome) {
      const passed = /^passed/i.test(outcome[1]);
      votes.push(voteFrom(outcome[2] === "House" ? "House" : "Senate", passed, outcome[3], action));
      continue;
    }
    // Agreeing to the other chamber's amendments: the last step before a bill goes to the President.
    const resolving = text.match(RESOLVING_RE);
    if (resolving && /\bagreed to\b/i.test(resolving[2]) && /amendment/i.test(resolving[2]) && !/not agreed to/i.test(resolving[2])) {
      votes.push(voteFrom(resolving[1] === "House" ? "House" : "Senate", true, resolving[2], action));
    }
  }

  const milestones = parseLifecycleActions(actions, laws);
  const type = ref.type.toUpperCase();

  if (milestones.became_law_date) {
    const pl = milestones.public_law;
    const label =
      milestones.law_kind === "enacted_over_veto"
        ? `Became law over the President's veto${pl ? ` (Public Law ${pl})` : ""}`
        : milestones.law_kind === "law_unsigned"
          ? `Became law without the President's signature${pl ? ` (Public Law ${pl})` : ""}`
          : `Became law${pl ? ` (Public Law ${pl})` : ""}`;
    return { status: { stage: "law", label }, votes };
  }
  if (milestones.vetoed_date) {
    return {
      status: { stage: "vetoed", label: milestones.law_kind === "pocket_vetoed" ? "Pocket vetoed by the President" : "Vetoed by the President" },
      votes,
    };
  }
  if (milestones.presented_date) {
    return { status: { stage: "passed_both", label: "Passed both chambers; sent to the President" }, votes };
  }

  const lastBy = (chamber: "House" | "Senate") => votes.filter((v) => v.chamber === chamber).at(-1) ?? null;
  const house = lastBy("House");
  const senate = lastBy("Senate");
  const passedHouse = house?.result === "Passed";
  const passedSenate = senate?.result === "Passed";

  if (isSimpleResolution(type)) {
    const chamber = originChamber(type);
    const last = chamber === "House" ? house : senate;
    if (last?.result === "Passed") return { status: { stage: "passed_chamber", label: `Agreed to in the ${chamber}` }, votes };
    if (last?.result === "Failed") return { status: { stage: "failed", label: `Failed in the ${chamber}` }, votes };
    return { status: { stage: "introduced", label: "Introduced" }, votes };
  }

  if (passedHouse && passedSenate) {
    return { status: { stage: "passed_both", label: "Passed the House and the Senate" }, votes };
  }
  if (passedHouse || passedSenate) {
    const chamber = passedHouse ? "House" : "Senate";
    const other = passedHouse ? senate : house;
    if (other?.result === "Failed") {
      return { status: { stage: "failed", label: `Passed the ${chamber}; failed in the ${other.chamber}` }, votes };
    }
    return { status: { stage: "passed_chamber", label: `Passed the ${chamber}` }, votes };
  }
  const failed = votes.filter((v) => v.result === "Failed").at(-1);
  if (failed) return { status: { stage: "failed", label: `Failed in the ${failed.chamber}` }, votes };
  return { status: { stage: "introduced", label: "Introduced" }, votes };
}
