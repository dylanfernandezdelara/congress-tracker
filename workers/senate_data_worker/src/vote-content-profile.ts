import type {
  BillRef,
  VoteContentConfidence,
  VoteContentProfile,
  VoteContentStage,
  VoteContentTargetType,
  VoteLedger,
  VoteLedgerEntry,
  VoteSourceBasis,
} from "./types";

type ProcedureKind =
  | "motion_to_discharge"
  | "point_of_order"
  | "motion_to_proceed"
  | "cloture"
  | "motion_to_table"
  | "procedural_vote";

export interface ProcedureDescriptor {
  kind: ProcedureKind;
  label: string;
}

export function describeProcedure(entry: VoteLedgerEntry): ProcedureDescriptor | null {
  const text = `${entry.title} ${entry.question}`.toLowerCase();
  if (text.includes("motion to discharge")) {
    return { kind: "motion_to_discharge", label: "Motion to discharge" };
  }
  if (text.includes("point of order")) {
    return { kind: "point_of_order", label: "Point of order" };
  }
  if (text.includes("motion to proceed")) {
    return { kind: "motion_to_proceed", label: "Motion to proceed" };
  }
  if (text.includes("cloture")) {
    return { kind: "cloture", label: "Cloture vote" };
  }
  if (text.includes("motion to table")) {
    return { kind: "motion_to_table", label: "Motion to table" };
  }
  if (/privilege status|reconsider|appeal.*chair|discharge|table|procedural/.test(text)) {
    return { kind: "procedural_vote", label: "Procedural vote" };
  }
  return null;
}

const TOPIC_RULES: { topic: string; re: RegExp }[] = [
  { topic: "budget", re: /\b(budget|appropriation|reconciliation|deficit|fiscal|continuing resolution)\b/i },
  { topic: "tax", re: /\b(tax|revenue|irs|excise|tariff)\b/i },
  { topic: "immigration", re: /\b(immigration|border|asylum|visa|naturalization)\b/i },
  { topic: "defense", re: /\b(defense|military|armed forces|pentagon|dod|war powers)\b/i },
  { topic: "health", re: /\b(health care|medicare|medicaid|fda|public health|disease)\b/i },
  { topic: "public_lands", re: /\b(public land|national park|wilderness|conservation|forest service|blm)\b/i },
  { topic: "foreign_policy", re: /\b(foreign military sale|fms|state department|sanction|treaty|diplomatic)\b/i },
  { topic: "courts", re: /\b(judge|judiciary|court|nomination|confirmation)\b/i },
];

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  const sliced = t.slice(0, maxLen).trimEnd();
  return `${sliced.replace(/\s+\S*$/, "").trimEnd()}...`;
}

function extractOfficialBillSummary(bill: BillRef | undefined): string | null {
  if (!bill?.summary?.trim()) return null;
  const cleaned = stripHtml(bill.summary);
  if (!cleaned) return null;
  const title = bill.title?.trim();
  if (!title) return cleaned;
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleaned.replace(new RegExp(`^${escapedTitle}\\s*[:.-]*\\s*`, "i"), "").trim() || cleaned;
}

function extractAnalysisSummary(bill: BillRef | undefined): string | null {
  const s = bill?.analysis?.plain_summary?.trim();
  if (!s) return null;
  return stripHtml(s);
}

function extractConfirmationTarget(title: string): string | null {
  const match = /^confirmation:\s*(.+)$/i.exec(title.trim());
  return match?.[1]?.trim() || null;
}

function isAmendmentVote(entry: VoteLedgerEntry): boolean {
  const q = `${entry.question} ${entry.title} ${entry.issue ?? ""}`.toLowerCase();
  return /\bs\.?\s*amdt\.?\s*\d+/i.test(q) || /\bon the amendment\b/.test(q) || /\bamendment\s+(no\.|number)?\s*\d+/i.test(q);
}

function isNominationVote(entry: VoteLedgerEntry): boolean {
  return Boolean(extractConfirmationTarget(entry.title)) || Boolean(entry.issue?.startsWith("PN"));
}

function billLooksLikeResolution(bill: BillRef | undefined): boolean {
  if (!bill?.type) return false;
  const t = bill.type.toUpperCase();
  return (
    t.includes("RES") ||
    t.includes("J.RES") ||
    t.includes("CON.RES") ||
    t === "SJRES" ||
    t === "HCONRES" ||
    t === "SCONRES"
  );
}

function resolveTargetType(entry: VoteLedgerEntry, bill: BillRef | undefined, procedure: ProcedureDescriptor | null): VoteContentTargetType {
  if (isNominationVote(entry)) return "nomination";
  if (isAmendmentVote(entry)) return "amendment";
  if (procedure && !bill) return "procedure";
  if (procedure && !bill?.summary && !bill?.title) return "procedure";
  if (!bill && !entry.issue?.trim()) return procedure ? "procedure" : "unknown";
  if (bill) {
    if (billLooksLikeResolution(bill)) return "resolution";
    return "bill";
  }
  if (entry.issue?.trim()) {
    const issue = entry.issue.trim().toUpperCase();
    if (issue.startsWith("PN")) return "nomination";
    if (/S\.?\s*AMDT|H\.?\s*AMDT/i.test(issue)) return "amendment";
    if (/RES|CON\.RES|J\.RES/i.test(issue)) return "resolution";
    return "bill";
  }
  return "unknown";
}

function isBudgetWaiverContext(entry: VoteLedgerEntry, bill: BillRef | undefined): boolean {
  const text = `${entry.title} ${entry.question} ${bill?.title ?? ""} ${bill?.policy_area ?? ""}`.toLowerCase();
  if (!text.includes("budget") && !/concurrent resolution/i.test(text)) return false;
  return (
    /\bwaiver\b/i.test(text) ||
    /\bpoint of order\b/i.test(text) ||
    /\bsection\s+304\b/i.test(text) ||
    /\bsection\s+312\b/i.test(text) ||
    /\breconciliation\b/i.test(text) ||
    /\bcongressional budget\b/i.test(text)
  );
}

function resolveStage(
  entry: VoteLedgerEntry,
  targetType: VoteContentTargetType,
  procedure: ProcedureDescriptor | null,
  bill: BillRef | undefined
): VoteContentStage {
  if (targetType === "nomination" || extractConfirmationTarget(entry.title) || /\bconfirmation\b/i.test(entry.question)) {
    return "confirmation";
  }
  if (isAmendmentVote(entry)) return "amendment_vote";
  if (procedure?.kind === "cloture") return "cloture";
  if (procedure?.kind === "motion_to_proceed") return "motion_to_proceed";
  if (procedure?.kind === "motion_to_discharge") return "motion_to_discharge";

  const q = `${entry.question} ${entry.title}`.toLowerCase();
  if (procedure && isBudgetWaiverContext(entry, bill)) return "budget_waiver";
  if (isBudgetWaiverContext(entry, bill) && /motion|table|waiver|point of order/i.test(q)) return "budget_waiver";

  if (
    /\bon passage\b/.test(q) ||
    /\bpassed\b.*\b(joint resolution|concurrent resolution|bill)\b/i.test(entry.result) ||
    (/\bagreed to\b/i.test(entry.result.toLowerCase()) && /\bresolution\b/i.test(q) && !procedure)
  ) {
    return "final_passage";
  }

  if (procedure) return "other";
  if (/\bcloture\b/.test(q)) return "cloture";
  if (/\bproceed\b/.test(q)) return "motion_to_proceed";
  return "other";
}

function collectPolicyTopics(entry: VoteLedgerEntry, bill: BillRef | undefined, officialSummary: string | null): string[] {
  const topics = new Set<string>();
  const blob = [
    officialSummary,
    bill?.policy_area,
    ...(bill?.subjects ?? []),
    bill?.title,
    entry.title,
    entry.question,
    bill?.analysis?.category,
    bill?.analysis?.why_it_matters,
  ]
    .filter(Boolean)
    .join(" ");

  for (const { topic, re } of TOPIC_RULES) {
    if (re.test(blob)) topics.add(topic);
  }
  return Array.from(topics).sort();
}

function collectAffectedGroups(bill: BillRef | undefined): string[] {
  const out = new Set<string>();
  for (const a of bill?.analysis?.affects ?? []) {
    const t = a.trim();
    if (t) out.add(t);
  }
  const summary = [bill?.summary, bill?.analysis?.why_it_matters].filter(Boolean).join(" ").toLowerCase();
  if (/\bamerican people\b|\bamericans\b|\bu\.s\. citizens\b/i.test(summary)) out.add("Americans");
  if (/\bfederal agenc/i.test(summary)) out.add("Federal agencies");
  return Array.from(out).sort();
}

function resolveContentConfidence(args: {
  targetType: VoteContentTargetType;
  stage: VoteContentStage;
  officialSummary: string | null;
  analysisSummary: string | null;
  bill: BillRef | undefined;
}): { confidence: VoteContentConfidence; basis: VoteSourceBasis[] } {
  const basis: VoteSourceBasis[] = [];
  const { targetType, stage, officialSummary, analysisSummary, bill } = args;

  if (officialSummary) basis.push("official_bill_summary");
  if (analysisSummary && !officialSummary) basis.push("analysis_summary");
  if (bill?.impact_evidence && Object.keys(bill.impact_evidence).length > 0) basis.push("impact_evidence");
  if (bill?.title || bill?.policy_area) basis.push("bill_metadata_only");
  basis.push("vote_question");

  const uniqueBasis = Array.from(new Set(basis));

  if (targetType === "amendment") {
    return { confidence: "low", basis: uniqueBasis };
  }

  if (stage === "budget_waiver") {
    return { confidence: "low", basis: uniqueBasis };
  }

  if (
    officialSummary &&
    (targetType === "bill" || targetType === "resolution") &&
    (stage === "final_passage" || stage === "confirmation")
  ) {
    return { confidence: "high", basis: uniqueBasis };
  }

  if (officialSummary && targetType === "nomination") {
    return { confidence: "medium", basis: uniqueBasis };
  }

  if (officialSummary && stage === "motion_to_discharge") {
    return { confidence: "medium", basis: uniqueBasis };
  }

  if (analysisSummary || officialSummary) {
    return { confidence: "medium", basis: uniqueBasis };
  }

  if (bill?.title || bill?.policy_area) {
    return { confidence: "medium", basis: uniqueBasis };
  }

  return { confidence: "low", basis: uniqueBasis };
}

function buildIssueLabel(entry: VoteLedgerEntry, bill: BillRef | undefined): string {
  if (entry.issue?.trim()) return entry.issue.trim();
  if (bill?.type && bill.number) return `${bill.type} ${bill.number}`;
  return "the measure";
}

function buildPlainAction(
  entry: VoteLedgerEntry,
  bill: BillRef | undefined,
  targetType: VoteContentTargetType,
  stage: VoteContentStage,
  statusPassed: boolean
): string {
  const label = buildIssueLabel(entry, bill);
  const passed = statusPassed;

  if (targetType === "nomination") {
    const who = extractConfirmationTarget(entry.title) ?? "the nominee";
    return passed
      ? `The Senate confirmed ${who}.`
      : `The Senate rejected confirmation of ${who}.`;
  }

  if (stage === "confirmation") {
    return passed ? `The Senate confirmed ${label}.` : `The Senate did not confirm ${label}.`;
  }

  if (stage === "cloture") {
    return passed
      ? `The Senate voted to invoke cloture on ${label}.`
      : `The Senate voted not to invoke cloture on ${label}.`;
  }

  if (stage === "motion_to_proceed") {
    return passed
      ? `The Senate agreed to proceed to consideration of ${label}.`
      : `The Senate declined to proceed to ${label}.`;
  }

  if (stage === "motion_to_discharge") {
    return passed
      ? `The Senate voted to discharge ${label} from committee.`
      : `The Senate voted not to discharge ${label} from committee.`;
  }

  if (stage === "amendment_vote") {
    return passed
      ? `The Senate agreed to an amendment related to ${label}.`
      : `The Senate rejected an amendment related to ${label}.`;
  }

  if (stage === "budget_waiver") {
    return passed
      ? `The Senate agreed to a budget-related procedural motion on ${label}.`
      : `The Senate rejected a budget-related procedural motion on ${label}.`;
  }

  if (stage === "final_passage") {
    return passed ? `The Senate passed ${label}.` : `The Senate rejected ${label}.`;
  }

  return passed ? `The Senate agreed to ${label}.` : `The Senate did not agree to ${label}.`;
}

function buildPublicImpactSummary(args: {
  bill: BillRef | undefined;
  targetType: VoteContentTargetType;
  stage: VoteContentStage;
  officialSummary: string | null;
  analysisSummary: string | null;
}): string {
  const { targetType, stage, officialSummary, analysisSummary, bill } = args;

  if (targetType === "amendment") {
    const parentBit = officialSummary
      ? truncate(officialSummary, 240)
      : analysisSummary
        ? truncate(analysisSummary, 240)
        : bill?.title
          ? `Parent measure: ${bill.title}.`
          : "Parent measure under consideration.";
    return `${parentBit} Official amendment-specific summary text is not available in the current feed.`;
  }

  if (officialSummary) {
    return truncate(officialSummary, 320);
  }

  if (analysisSummary) {
    return truncate(analysisSummary, 280);
  }

  if (stage === "motion_to_discharge" && bill?.title) {
    return `The vote concerns a motion to discharge ${bill.title}. No official bill summary is available in the current feed.`;
  }

  if (bill?.title) {
    return `The Senate acted on ${bill.title}. No official bill summary is available in the current feed.`;
  }

  return "No official bill summary is available in the current feed.";
}

/** Derives readable vote content (summary fields) without ranking or scoring. */
export function buildVoteContentContext(
  ledger: VoteLedger,
  entry: VoteLedgerEntry,
  bill: BillRef | undefined,
  procedure: ProcedureDescriptor | null
): VoteContentProfile {
  const officialSummary = extractOfficialBillSummary(bill);
  const analysisSummary = extractAnalysisSummary(bill);
  const targetType = resolveTargetType(entry, bill, procedure);
  const stage = resolveStage(entry, targetType, procedure, bill);

  const { confidence, basis } = resolveContentConfidence({
    targetType,
    stage,
    officialSummary,
    analysisSummary,
    bill,
  });

  const policyTopics = collectPolicyTopics(entry, bill, officialSummary);
  const affectedGroups = collectAffectedGroups(bill);
  const statusPassed = !/failed|rejected|not agreed|not passed|disagreed|not invoked|not confirmed/i.test(entry.result.toLowerCase());

  const plainAction = buildPlainAction(entry, bill, targetType, stage, statusPassed);
  const publicImpactSummary = buildPublicImpactSummary({
    bill,
    targetType,
    stage,
    officialSummary,
    analysisSummary,
  });

  const voteId = `${ledger.congress}:${ledger.session}:${entry.vote_number}`;

  const profile: VoteContentProfile = {
    vote_id: voteId,
    congress: ledger.congress,
    session: ledger.session,
    vote_number: entry.vote_number,
    vote_date: entry.vote_date,
    target_type: targetType,
    stage,
    plain_action: plainAction,
    official_summary: officialSummary,
    public_impact_summary: publicImpactSummary,
    policy_topics: policyTopics,
    affected_groups: affectedGroups,
    content_confidence: confidence,
    source_basis: basis,
  };

  return profile;
}
