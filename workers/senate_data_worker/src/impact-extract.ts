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

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function parseNumericAmount(rawNumber: string, unitWord: string | undefined): number | null {
  const normalized = rawNumber.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const unit = (unitWord ?? "").toLowerCase();
  if (unit.startsWith("thousand")) return value * 1_000;
  if (unit.startsWith("million")) return value * 1_000_000;
  if (unit.startsWith("billion")) return value * 1_000_000_000;
  if (unit.startsWith("trillion")) return value * 1_000_000_000_000;
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
  const amountRegex =
    /\$ ?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion))?/gi;

  for (let i = 0; i < sourceText.length; i++) {
    const text = sourceText[i];
    let match = amountRegex.exec(text);
    while (match) {
      const valueNumeric = parseNumericAmount(match[1], match[2]);
      if (valueNumeric !== null) {
        const key = `${valueNumeric}:${text}`;
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
      match = amountRegex.exec(text);
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
    /\b(grants? to [A-Za-z0-9,\-\s]+)\b/gi,
  ];

  for (const text of sourceText) {
    for (const regex of recipientRegexes) {
      let match = regex.exec(text);
      while (match) {
        const raw = match[1].replace(/\s+/g, " ").trim();
        const key = raw.toLowerCase();
        if (!seen.has(key) && raw.length > 4) {
          seen.add(key);
          out.push({
            type: classifyRecipientType(raw),
            name: raw,
            scope: "national",
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
    for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
      if (lower.includes(name)) states.push(code);
    }
  }
  return unique(states).sort();
}

function inferGeographyScope(sourceText: string[], states: string[]): GeographyScope {
  if (states.length > 0) return "state-named";
  const joined = sourceText.join(" ").toLowerCase();
  if (joined.includes("formula grant") || joined.includes("states")) return "state-formula";
  if (joined.includes("local")) return "local";
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

function computeRichnessScore(params: {
  amountCount: number;
  recipientCount: number;
  stateSignal: boolean;
  dateSignal: boolean;
  unknownCount: number;
}): number {
  let score = 0;
  if (params.amountCount > 0) score += 30;
  if (params.recipientCount > 0) score += 25;
  if (params.stateSignal) score += 20;
  if (params.dateSignal) score += 15;
  if (params.unknownCount > 0) score += 10;
  return Math.max(0, Math.min(100, score));
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
  const unknowns = buildUnknowns(
    evidenceRaw.source_availability,
    amounts,
    recipients,
    dateSignals,
    geographyScope
  );
  const what = buildWhatSignals(ref, sourceText);

  const richnessScore = computeRichnessScore({
    amountCount: amounts.length,
    recipientCount: recipients.length,
    stateSignal: states.length > 0 || geographyScope === "state-formula",
    dateSignal: dateSignals.length > 0,
    unknownCount: unknowns.length,
  });

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
    richness_score: richnessScore,
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
    richness_score: evidence.richness_score,
    source_availability: evidence.source_availability,
  };
}
