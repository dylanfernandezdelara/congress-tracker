import type {
  AmountEvidence,
  BillEvidenceRaw,
  BillImpactEvidence,
  BillRef,
  BillTrendSnapshot,
  GeographyScope,
  ImpactDateSignal,
  RecipientEvidence,
  UnknownReason,
} from "./types";
import { STATE_CODES_FOR_MATCHING, STATE_NAME_ENTRIES } from "./states";
import { extractPolicyDeltas } from "./policy-delta-extract";

const AMBIGUOUS_STATE_CODES = new Set(["IN", "OR", "ME", "AS", "TO", "IT", "AT", "BY", "ON", "NO"]);

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function parseNumericAmount(rawNumber: string, unitWord: string | undefined): number | null {
  const normalized = rawNumber.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const unit = (unitWord ?? "").toLowerCase();
  if (unit.startsWith("thousand") || unit === "k") return value * 1_000;
  if (unit.startsWith("million") || unit === "m") return value * 1_000_000;
  if (unit.startsWith("billion") || unit === "b") return value * 1_000_000_000;
  if (unit.startsWith("trillion") || unit === "t") return value * 1_000_000_000_000;
  return value;
}

function inferAmountType(context: string): AmountEvidence["amount_type"] {
  const lc = context.toLowerCase();
  if (lc.includes("appropriat")) return "appropriation";
  if (lc.includes("authorize")) return "authorization";
  if (lc.includes("revenue")) return "revenue";
  if (lc.includes("deficit")) return "deficit_impact";
  return "other";
}

function extractAmounts(sourceText: string[]): AmountEvidence[] {
  const out: AmountEvidence[] = [];
  const seen = new Set<string>();
  const amountRegexes = [
    /\$ ?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion|k|m|b|t))?/gi,
    /\b(\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion)\b/gi,
  ];

  for (let i = 0; i < sourceText.length; i++) {
    const text = sourceText[i];
    for (const regex of amountRegexes) {
      let match = regex.exec(text);
      while (match) {
        const valueNumeric = parseNumericAmount(match[1], match[2]);
        if (valueNumeric !== null) {
          const key = `${valueNumeric}:${i}`;
          if (!seen.has(key)) {
            seen.add(key);
            const fiscalYearMatch = text.match(/fiscal year\s*(20\d{2})/i);
            out.push({
              value_numeric: valueNumeric,
              unit: "USD",
              amount_type: inferAmountType(text),
              fiscal_year: fiscalYearMatch ? Number(fiscalYearMatch[1]) : undefined,
              source_endpoint: "summaries",
              source_ref: `source_text:${i + 1}`,
              raw_text: text.slice(0, 500),
            });
          }
        }
        match = regex.exec(text);
      }
    }
  }

  out.sort((a, b) => b.value_numeric - a.value_numeric);
  return out.slice(0, 12);
}

function classifyRecipientType(name: string): RecipientEvidence["type"] {
  const lc = name.toLowerCase();
  if (lc.includes("department") || lc.includes("agency") || lc.includes("administration")) {
    return "agency";
  }
  if (lc.includes("program") || lc.includes("grant")) return "program";
  if (lc.includes("household") || lc.includes("famil")) return "household";
  if (lc.includes("city") || lc.includes("county") || lc.includes("municipal")) return "local";
  return "other";
}

function extractRecipients(sourceText: string[]): RecipientEvidence[] {
  const out: RecipientEvidence[] = [];
  const seen = new Set<string>();
  const recipientRegexes = [
    /\b(Department of [A-Z][A-Za-z\s]+)\b/g,
    /\b([A-Z][A-Za-z\s]+ Administration)\b/g,
    /\b([A-Z][A-Za-z\s]+ Agency)\b/g,
    /\b([A-Z][A-Za-z\s]+ Program)\b/g,
    /\b([A-Z][A-Za-z\s]+ Department)\b/g,
    /\b([A-Z][A-Za-z\s]+ Authority)\b/g,
    /\b([A-Z][A-Za-z\s]+ Commission)\b/g,
    /\b(grants? to [A-Za-z0-9,\-\s]+)\b/gi,
    /\b(funding for [A-Za-z0-9,\-\s]+)\b/gi,
  ];

  for (const text of sourceText) {
    for (const regex of recipientRegexes) {
      let match = regex.exec(text);
      while (match) {
        const raw = match[1].replace(/\s+/g, " ").trim();
        const key = raw.toLowerCase();
        if (!seen.has(key) && raw.length > 4) {
          seen.add(key);
          const stateCode = STATE_NAME_ENTRIES.find(([name]) => raw.toLowerCase().includes(name))?.[1];
          out.push({
            type: classifyRecipientType(raw),
            name: raw,
            scope: stateCode ? "state-specific" : "national",
            state_code: stateCode,
          });
        }
        match = regex.exec(text);
      }
    }
  }
  return out.slice(0, 12);
}

function extractDateSignals(sourceText: string[]): ImpactDateSignal[] {
  const out: ImpactDateSignal[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < sourceText.length; i++) {
    const text = sourceText[i];
    const isoDateMatches = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
    for (const date of isoDateMatches) {
      if (seen.has(date)) continue;
      seen.add(date);
      out.push({
        date,
        date_text: `Explicit date reference: ${date}`,
        source_endpoint: "summaries",
        source_ref: `source_text:${i + 1}`,
      });
    }

    const fyMatch = text.match(/\bfiscal year\s*(20\d{2})\b/i);
    if (fyMatch) {
      const key = `fy:${fyMatch[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          date_text: `Fiscal year ${fyMatch[1]}`,
          source_endpoint: "summaries",
          source_ref: `source_text:${i + 1}`,
        });
      }
    }

    if (/upon enactment|within \d+ days|effective on/i.test(text)) {
      const key = `timing:${text}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          date_text: text.slice(0, 220),
          source_endpoint: "summaries",
          source_ref: `source_text:${i + 1}`,
        });
      }
    }
  }
  return out.slice(0, 10);
}

function extractStates(sourceText: string[]): string[] {
  const states: string[] = [];
  for (const text of sourceText) {
    const lower = text.toLowerCase();
    for (const [name, code] of STATE_NAME_ENTRIES) {
      if (lower.includes(name)) states.push(code);
    }
    const upperText = text.toUpperCase();
    for (const code of STATE_CODES_FOR_MATCHING) {
      if (AMBIGUOUS_STATE_CODES.has(code)) continue;
      const codePattern = new RegExp(
        `(?:\\bIN\\s+|\\bFOR\\s+|\\bTO\\s+|\\bFROM\\s+|\\bAND\\s+|\\(|,\\s*|\\bSTATE OF\\s+)${code}(?:\\b|\\))`,
        "i"
      );
      if (codePattern.test(upperText)) states.push(code);
    }
  }
  return unique(states).sort();
}

function inferGeographyScope(sourceText: string[], states: string[]): GeographyScope {
  if (states.length > 1 && sourceText.join(" ").toLowerCase().includes("local")) return "mixed";
  if (states.length > 0) return "state-named";
  const joined = sourceText.join(" ").toLowerCase();
  if (
    joined.includes("formula grant") ||
    joined.includes("state allocation") ||
    joined.includes("among the states") ||
    joined.includes("states")
  ) {
    return "state-formula";
  }
  if (
    joined.includes("local") ||
    joined.includes("county") ||
    joined.includes("city") ||
    joined.includes("municipal")
  ) {
    return "local";
  }
  if (joined.trim()) return "national";
  return "unknown";
}

function buildUnknowns(
  sourceAvailability: BillEvidenceRaw["source_availability"],
  amounts: AmountEvidence[],
  recipients: RecipientEvidence[],
  dateSignals: ImpactDateSignal[],
  geographyScope: GeographyScope
): UnknownReason[] {
  const checked = Object.entries(sourceAvailability)
    .filter(([, ok]) => ok !== undefined)
    .map(([key]) => key);

  const out: UnknownReason[] = [];
  if (amounts.length === 0) {
    out.push({
      missing_field: "amount",
      category: sourceAvailability.cbo_cost_estimates ? "detail_gap" : "no_source",
      reason: "No concrete dollar amount could be extracted from available official sources.",
      sources_checked: checked,
    });
  }
  if (recipients.length === 0) {
    out.push({
      missing_field: "recipient",
      category: "detail_gap",
      reason: "Sources do not clearly identify specific funding recipients or beneficiary entities.",
      sources_checked: checked,
    });
  }
  if (dateSignals.length === 0) {
    out.push({
      missing_field: "effective_date",
      category: "timing_gap",
      reason: "No explicit implementation or effective-date signal was found in available text.",
      sources_checked: checked,
    });
  }
  if (geographyScope === "unknown" || geographyScope === "national") {
    out.push({
      missing_field: "state_signal",
      category: "scope_gap",
      reason: "State-specific allocation detail is not explicitly provided in available sources.",
      sources_checked: checked,
    });
  }
  return out;
}

function buildWhatSignals(ref: BillRef, sourceText: string[]): string[] {
  const candidates = [
    ref.title,
    ref.summary,
    ...sourceText,
  ]
    .filter((item): item is string => Boolean(item && item.trim()))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 25);
  return unique(candidates).slice(0, 8);
}

export interface ExtractImpactOptions {
  session: number;
  generatedAt?: string;
}

export function extractBillImpactEvidence(
  ref: BillRef,
  evidenceRaw: BillEvidenceRaw,
  options: ExtractImpactOptions
): BillImpactEvidence {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourceText = evidenceRaw.source_text ?? [];
  const amounts = extractAmounts(sourceText);
  const recipients = extractRecipients(sourceText);
  const dateSignals = extractDateSignals(sourceText);
  const states = extractStates(sourceText);
  const geographyScope = inferGeographyScope(sourceText, states);
  const policyDeltas = extractPolicyDeltas(sourceText);
  const unknowns = buildUnknowns(
    evidenceRaw.source_availability,
    amounts,
    recipients,
    dateSignals,
    geographyScope
  );
  const what = buildWhatSignals(ref, sourceText);

  return {
    schema_version: 1,
    bill_key: evidenceRaw.bill_key,
    congress: ref.congress,
    session: options.session,
    generated_at: generatedAt,
    source_availability: evidenceRaw.source_availability,
    who: recipients,
    what,
    how_much: amounts,
    when: dateSignals,
    where: {
      geography_scope: geographyScope,
      states_mentioned: states,
    },
    unknowns,
    policy_deltas: policyDeltas,
    summary_evidence: sourceText.slice(0, 10),
  };
}

export function buildTrendSnapshot(
  ref: BillRef,
  evidence: BillImpactEvidence,
  snapshotDate: string
): BillTrendSnapshot {
  const amountTotal = evidence.how_much.reduce((sum, item) => sum + item.value_numeric, 0);
  return {
    schema_version: 1,
    bill_key: evidence.bill_key,
    congress: ref.congress,
    session: evidence.session,
    snapshot_date: snapshotDate,
    generated_at: evidence.generated_at,
    amount_total_nominal: amountTotal > 0 ? amountTotal : undefined,
    recipient_count: evidence.who.length,
    geography_scope: evidence.where.geography_scope,
    states_mentioned: evidence.where.states_mentioned,
    policy_area: ref.policy_area,
    source_availability: evidence.source_availability,
  };
}
