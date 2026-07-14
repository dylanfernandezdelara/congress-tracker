import type { BillLawKind } from "../../../../shared/lifecycle-api-types";

export interface CongressAction {
  actionCode?: string | null;
  actionDate?: string | null;
  text?: string | null;
  type?: string | null;
}

export interface ParsedLifecycleMilestones {
  presented_date: string | null;
  signed_date: string | null;
  vetoed_date: string | null;
  became_law_date: string | null;
  law_kind: BillLawKind | null;
  public_law: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
}

const PUBLIC_LAW_RE = /Became Public Law No:\s*([\d-]+)/i;
const SIGNED_TEXT_RE = /signed by president/i;
const BECAME_LAW_SIGNING_RE = /became public law/i;
const VETOED_TEXT_RE = /vetoed/i;
const POCKET_VETO_RE = /pocket/i;
const PRESENTED_TEXT_RE = /Presented to President/i;
const LAW_UNSIGNED_TEXT_RE =
  /became public law.*unsigned|without.*signature|Became Public Law No:/i;

function actionDate(action: CongressAction): string | null {
  const raw = action.actionDate?.trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

function actionText(action: CongressAction): string {
  return action.text?.trim() ?? "";
}

function codeOf(action: CongressAction): string | null {
  const code = action.actionCode;
  if (code == null || code === "") return null;
  return String(code);
}

function extractPublicLaw(text: string): string | null {
  const match = text.match(PUBLIC_LAW_RE);
  return match?.[1] ?? null;
}

function pickLatestDate(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current) return next;
  return next > current ? next : current;
}

/**
 * Parse congress.gov bill actions into presidential / enactment milestones.
 * Prefer actionCode when present; fall back to text matching when code is null.
 */
export function parseLifecycleActions(actions: CongressAction[]): ParsedLifecycleMilestones {
  let presented_date: string | null = null;
  let signed_date: string | null = null;
  let vetoed_date: string | null = null;
  let became_law_date: string | null = null;
  let public_law: string | null = null;
  let pocket = false;
  let law_unsigned = false;
  let saw_signing_law = false;

  const sorted = [...actions].sort((a, b) => {
    const da = actionDate(a) ?? "";
    const db = actionDate(b) ?? "";
    return da.localeCompare(db);
  });

  let latest_action_date: string | null = null;
  let latest_action_text: string | null = null;
  for (const action of sorted) {
    const date = actionDate(action);
    const text = actionText(action);
    if (date && (!latest_action_date || date >= latest_action_date)) {
      latest_action_date = date;
      latest_action_text = text || latest_action_text;
    }

    const code = codeOf(action);

    const isPresented = code === "28000" || PRESENTED_TEXT_RE.test(text);
    if (isPresented && date) {
      presented_date = pickLatestDate(presented_date, date);
    }

    const isSigned =
      code === "29000" ||
      code === "36000" ||
      (SIGNED_TEXT_RE.test(text) && BECAME_LAW_SIGNING_RE.test(text)) ||
      (SIGNED_TEXT_RE.test(text) && !VETOED_TEXT_RE.test(text));
    if (isSigned && date) {
      signed_date = pickLatestDate(signed_date, date);
      if (BECAME_LAW_SIGNING_RE.test(text) || code === "36000") {
        became_law_date = pickLatestDate(became_law_date, date);
        saw_signing_law = true;
      }
      const pl = extractPublicLaw(text);
      if (pl) public_law = pl;
    }

    const isVetoed = code === "30000" || code === "31000" || VETOED_TEXT_RE.test(text);
    if (isVetoed && date) {
      vetoed_date = pickLatestDate(vetoed_date, date);
      if (POCKET_VETO_RE.test(text) || code === "31000") {
        pocket = true;
      }
    }

    const isLawUnsignedCode = code === "38000";
    const isLawUnsignedText =
      /became public law.*unsigned|without.*signature/i.test(text) ||
      (PUBLIC_LAW_RE.test(text) && !SIGNED_TEXT_RE.test(text) && !saw_signing_law);
    if ((isLawUnsignedCode || isLawUnsignedText) && date) {
      became_law_date = pickLatestDate(became_law_date, date);
      law_unsigned = true;
      const pl = extractPublicLaw(text);
      if (pl) public_law = pl;
    } else if (LAW_UNSIGNED_TEXT_RE.test(text) && !SIGNED_TEXT_RE.test(text) && date) {
      const pl = extractPublicLaw(text);
      if (pl) public_law = pl;
    }
  }

  let law_kind: BillLawKind | null = null;
  if (vetoed_date) {
    law_kind = pocket ? "pocket_vetoed" : "vetoed";
  } else if (signed_date) {
    law_kind = "signed";
  } else if (became_law_date && law_unsigned) {
    law_kind = "law_unsigned";
  } else if (became_law_date && !signed_date) {
    law_kind = "law_unsigned";
  }

  return {
    presented_date,
    signed_date,
    vetoed_date,
    became_law_date,
    law_kind,
    public_law,
    latest_action_date,
    latest_action_text,
  };
}

/** True when formal congress.gov outcome is terminal (no further refresh needed). */
export function isTerminalLifecycle(params: {
  law_kind: BillLawKind | null;
  signed_date: string | null;
  vetoed_date: string | null;
  became_law_date: string | null;
}): boolean {
  if (params.law_kind != null) return true;
  if (params.signed_date || params.vetoed_date || params.became_law_date) return true;
  return false;
}
