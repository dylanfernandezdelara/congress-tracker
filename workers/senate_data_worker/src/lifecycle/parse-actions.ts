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
// Lookbehind excludes "unsigned by President" (e.g. the 38000 action text).
const SIGNED_TEXT_RE = /(?<!un)signed by president/i;
const BECAME_LAW_TEXT_RE = /became public law/i;
const VETOED_TEXT_RE = /vetoed/i;
const POCKET_VETO_RE = /pocket/i;
const PRESENTED_TEXT_RE = /Presented to President/i;
const LAW_UNSIGNED_TEXT_RE = /became public law.*unsigned|without.*signature/i;
const OVER_VETO_TEXT_RE = /enacted over veto|over.*veto/i;

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
  let enacted_over_veto = false;

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

    // LOC action codes: 29000 "Signed by President", 37000 "Public Law signed
    // by President". 36000 "Became Public Law" is generic (every enacted bill
    // carries it) and is NOT evidence of a signature.
    const isSigned =
      code === "29000" ||
      code === "37000" ||
      (SIGNED_TEXT_RE.test(text) && !VETOED_TEXT_RE.test(text));
    if (isSigned && date) {
      signed_date = pickLatestDate(signed_date, date);
    }

    const isBecameLaw =
      code === "36000" ||
      code === "37000" ||
      code === "38000" ||
      code === "39000" ||
      BECAME_LAW_TEXT_RE.test(text);
    if (isBecameLaw && date) {
      became_law_date = pickLatestDate(became_law_date, date);
      const pl = extractPublicLaw(text);
      if (pl) public_law = pl;
    }

    // 39000 "Public Law enacted over veto" / veto-override text.
    if ((code === "39000" || OVER_VETO_TEXT_RE.test(text)) && date) {
      enacted_over_veto = true;
    }

    // LOC action codes: 30000 "Pocket vetoed by President", 31000 "Vetoed by President".
    const isVetoed = code === "30000" || code === "31000" || VETOED_TEXT_RE.test(text);
    if (isVetoed && date) {
      vetoed_date = pickLatestDate(vetoed_date, date);
      if (code === "30000" || POCKET_VETO_RE.test(text)) {
        pocket = true;
      }
    }

    // 38000 "Public Law unsigned by President" (Article I §7 ten-day lapse).
    if ((code === "38000" || LAW_UNSIGNED_TEXT_RE.test(text)) && date) {
      law_unsigned = true;
    }
  }

  let law_kind: BillLawKind | null = null;
  if (became_law_date) {
    if (enacted_over_veto) {
      law_kind = "enacted_over_veto";
    } else if (law_unsigned) {
      law_kind = "law_unsigned";
    } else if (signed_date) {
      law_kind = "signed";
    } else {
      // Enacted with no explicit signature or ten-day-lapse evidence; the
      // overwhelmingly common path is a signed law whose 29000/37000 action
      // is absent from the page, but we cannot assert it, so leave kind null
      // and let the UI show a generic "Law" outcome.
      law_kind = null;
    }
  } else if (vetoed_date) {
    law_kind = pocket ? "pocket_vetoed" : "vetoed";
  } else if (signed_date) {
    law_kind = "signed";
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

/**
 * True when formal congress.gov outcome is terminal (no further refresh needed).
 * A bare veto is NOT terminal: Congress may still override it (LOC 32000/34000/39000),
 * so vetoed bills keep refreshing until they leave the feed window.
 */
export function isTerminalLifecycle(params: {
  law_kind: BillLawKind | null;
  signed_date: string | null;
  vetoed_date: string | null;
  became_law_date: string | null;
}): boolean {
  return Boolean(params.became_law_date || params.signed_date);
}
