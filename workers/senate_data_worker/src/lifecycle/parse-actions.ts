import type { BillLawKind } from "../../../../shared/lifecycle-api-types";

export interface CongressAction {
  actionCode?: string | null;
  actionDate?: string | null;
  text?: string | null;
  type?: string | null;
  sourceSystem?: { name?: string | null; code?: number | null } | null;
  committees?: Array<{ name?: string | null; systemCode?: string | null }> | null;
}

/** The bill detail's structured `laws` list: `[{ number: "119-111", type: "Public Law" }]`. */
export interface CongressLaw {
  number?: string | null;
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
  /**
   * Presidential or enactment actions whose wording matched none of the known phrases. They are never guessed at:
   * the outcome they would decide stays null, and callers log them for review.
   */
  unrecognized: string[];
}

/*
 * Status is read from the Library of Congress's standard action wording, not from action codes. Codes differ by the
 * system that recorded the action: the House system tags "Signed by President." E30000, and the Library tags it
 * 36000, the same code it gives "Became Public Law No: …". Reading the codes labeled signed laws as unsigned.
 */
const PRESENTED_RE = /^presented to (the )?president\b/i;
const SIGNED_RE = /^(public law )?signed by (the )?president\b/i;
const POCKET_VETO_RE = /^pocket vetoed by (the )?president\b/i;
const VETOED_RE = /^vetoed by (the )?president\b/i;
const BECAME_LAW_RE = /^became public law no:\s*([\d-]+)/i;
const ENACTED_OVER_VETO_RE = /^public law enacted over (the )?veto\b/i;
/** The ten-day lapse (Article I §7): "Sent to Archivist of the United States unsigned.", "Public Law unsigned by President.", "Became Public Law No: 119-200 without signature." */
const UNSIGNED_RE = /^sent to (the )?archivist of the united states unsigned\b|^public law unsigned by (the )?president\b|^became public law no:\s*[\d-]+\s+without (the president's )?signature\b/i;
/** Wording that concerns the President's action or enactment: anything here that matches no phrase above is flagged. */
const PRESIDENTIAL_RE = /\bpresident\b|\bpublic law\b|\barchivist\b|\bvetoe?d?\b/i;
/** Floor and committee actions that mention the President or a veto without being the presidential action itself. */
const NOT_PRESIDENTIAL_ACTION_RE = /\bveto message\b|\bover (the )?veto\b|objections of the president|\bmotion\b|\bcommittee\b|\breferred\b|\bconsidered\b|\breceived\b|\bheld at the desk\b|\bpassed\b|\bagreed to\b|\bmessage on\b|\bpresident pro tempore\b|\bpresident of the senate\b/i;

function actionDate(action: CongressAction): string | null {
  const raw = action.actionDate?.trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

function actionText(action: CongressAction): string {
  return action.text?.trim() ?? "";
}

function pickLatestDate(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current) return next;
  return next > current ? next : current;
}

function publicLawFromLaws(laws: CongressLaw[] | null | undefined): string | null {
  const law = (laws ?? []).find((l) => /public/i.test(l.type ?? "") && /^\d+-\d+$/.test(l.number?.trim() ?? ""));
  return law?.number?.trim() ?? null;
}

/**
 * Parse congress.gov bill actions (plus the bill's structured `laws` list, when the caller has it) into presidential
 * and enactment milestones. Enactment and the law number come from `laws` when present; signed, vetoed and unsigned
 * come only from the standard action wording. Enacted over a veto is a veto followed by enactment.
 */
export function parseLifecycleActions(
  actions: CongressAction[],
  laws?: CongressLaw[] | null
): ParsedLifecycleMilestones {
  let presented_date: string | null = null;
  let signed_date: string | null = null;
  let vetoed_date: string | null = null;
  let became_law_date: string | null = null;
  let public_law: string | null = publicLawFromLaws(laws);
  let pocket = false;
  let unsigned = false;
  const unrecognized: string[] = [];

  const sorted = [...actions].sort((a, b) => (actionDate(a) ?? "").localeCompare(actionDate(b) ?? ""));

  let latest_action_date: string | null = null;
  let latest_action_text: string | null = null;
  for (const action of sorted) {
    const date = actionDate(action);
    const text = actionText(action);
    if (date && (!latest_action_date || date >= latest_action_date)) {
      latest_action_date = date;
      latest_action_text = text || latest_action_text;
    }
    if (!date || !text) continue;

    if (PRESENTED_RE.test(text)) {
      presented_date = pickLatestDate(presented_date, date);
      continue;
    }
    if (SIGNED_RE.test(text)) {
      signed_date = pickLatestDate(signed_date, date);
      continue;
    }
    if (UNSIGNED_RE.test(text)) {
      unsigned = true;
      became_law_date = pickLatestDate(became_law_date, date);
      const lapsed = text.match(BECAME_LAW_RE);
      if (lapsed && !public_law) public_law = lapsed[1];
      continue;
    }
    const becameLaw = text.match(BECAME_LAW_RE);
    if (becameLaw) {
      became_law_date = pickLatestDate(became_law_date, date);
      if (!public_law) public_law = becameLaw[1];
      continue;
    }
    if (ENACTED_OVER_VETO_RE.test(text)) {
      became_law_date = pickLatestDate(became_law_date, date);
      continue;
    }
    if (POCKET_VETO_RE.test(text)) {
      pocket = true;
      vetoed_date = pickLatestDate(vetoed_date, date);
      continue;
    }
    if (VETOED_RE.test(text)) {
      vetoed_date = pickLatestDate(vetoed_date, date);
      continue;
    }
    if (PRESIDENTIAL_RE.test(text) && !NOT_PRESIDENTIAL_ACTION_RE.test(text)) {
      unrecognized.push(`${date}: ${text}`);
    }
  }

  // The structured law list is authoritative for enactment; date it from the latest action when no action says so.
  if (public_law && !became_law_date) became_law_date = latest_action_date;

  let law_kind: BillLawKind | null = null;
  if (became_law_date) {
    if (vetoed_date && vetoed_date <= became_law_date) law_kind = "enacted_over_veto";
    else if (signed_date && unsigned) {
      // Conflicting wording: say only that it became law, and flag it.
      unrecognized.push(`${became_law_date}: both signed and unsigned wording`);
    } else if (signed_date) law_kind = "signed";
    else if (unsigned) law_kind = "law_unsigned";
    // Otherwise enacted with no signature or lapse wording on the page yet: leave kind null (the UI shows "Law").
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
    unrecognized,
  };
}

/**
 * True when formal congress.gov outcome is terminal (no further refresh needed).
 * Require `became_law_date` so a bare `signed_date` keeps refreshing until
 * public-law / enactment fields land. Archivist-unsigned often precedes the
 * formal Public Law number, so unsigned rows also keep refreshing until
 * `public_law` is present. A bare veto is NOT terminal: Congress may still
 * override it (LOC 32000/34000/39000).
 */
export function isTerminalLifecycle(params: {
  law_kind: BillLawKind | null;
  signed_date: string | null;
  vetoed_date: string | null;
  became_law_date: string | null;
  public_law?: string | null;
}): boolean {
  if (!params.became_law_date) return false;
  if (params.law_kind === "law_unsigned" && !params.public_law) return false;
  return true;
}
