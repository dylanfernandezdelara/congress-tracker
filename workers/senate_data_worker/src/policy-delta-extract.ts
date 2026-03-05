import type { PolicyDelta, PolicyDeltaAction } from "./types";

interface DeltaPattern {
  action: PolicyDeltaAction;
  regex: RegExp;
}

const DELTA_PATTERNS: DeltaPattern[] = [
  { action: "nullify", regex: /\bnullif(?:y|ies|ied)\b([^.;:]{0,220})/i },
  { action: "reinstate", regex: /\breinstate(?:s|d)?\b([^.;:]{0,220})/i },
  { action: "decouple", regex: /\bdecoupl(?:e|es|ed|ing)\b([^.;:]{0,220})/i },
  { action: "restore", regex: /\brestor(?:e|es|ed|ing)\b([^.;:]{0,220})/i },
  { action: "prohibit", regex: /\bprohibit(?:s|ed|ing)?\b([^.;:]{0,220})/i },
  { action: "restrict", regex: /\b(restrict(?:s|ed|ing)?|limit(?:s|ed|ing)?|reduce(?:s|d)?)\b([^.;:]{0,220})/i },
  { action: "expand", regex: /\b(expand(?:s|ed|ing)?|increase(?:s|d)?|broaden(?:s|ed|ing)?)\b([^.;:]{0,220})/i },
  { action: "authorize", regex: /\bauthoriz(?:e|es|ed|ing)\b([^.;:]{0,220})/i },
  { action: "modify", regex: /\b(amend(?:s|ed|ing)?|modif(?:y|ies|ied|ying))\b([^.;:]{0,220})/i },
];

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 24);
}

function truncate(text: string, maxLen = 260): string {
  if (text.length <= maxLen) return text;
  const sliced = text.slice(0, maxLen).trimEnd();
  return `${sliced.replace(/\s+\S*$/, "").trimEnd()}...`;
}

function normalizeTarget(raw: string): string {
  const cleaned = raw
    .replace(/^[\s,;:.-]+/, "")
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Referenced policy provisions";
  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trimEnd()}...` : cleaned;
}

function deriveBeforeState(action: PolicyDeltaAction): string | undefined {
  if (action === "nullify" || action === "prohibit" || action === "restrict") {
    return "Referenced policy provisions were in force.";
  }
  if (action === "reinstate" || action === "restore") {
    return "Referenced policy provisions had been modified or removed.";
  }
  return undefined;
}

function deriveAfterState(action: PolicyDeltaAction): string | undefined {
  if (action === "nullify" || action === "prohibit") {
    return "Referenced policy provisions are blocked or voided.";
  }
  if (action === "reinstate" || action === "restore") {
    return "Referenced policy provisions are put back in force.";
  }
  if (action === "restrict") {
    return "Referenced policy provisions apply in a narrower scope.";
  }
  if (action === "expand" || action === "authorize") {
    return "Referenced policy provisions apply in a broader scope.";
  }
  return undefined;
}

function inferConfidence(target: string, sentence: string): PolicyDelta["confidence"] {
  if (target.length >= 20 && sentence.length >= 50) return "high";
  if (target.length >= 10) return "medium";
  return "low";
}

export function extractPolicyDeltas(sourceText: string[]): PolicyDelta[] {
  const out: PolicyDelta[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < sourceText.length; index++) {
    const normalizedText = stripHtml(sourceText[index]);
    if (!normalizedText) continue;
    const sentences = splitSentences(normalizedText);

    for (const sentence of sentences) {
      for (const pattern of DELTA_PATTERNS) {
        const match = sentence.match(pattern.regex);
        if (!match) continue;
        const trailing = match[2] ?? match[1] ?? "";
        const target = normalizeTarget(trailing);
        const dedupeKey = `${pattern.action}:${target.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        out.push({
          action: pattern.action,
          target,
          before_state: deriveBeforeState(pattern.action),
          after_state: deriveAfterState(pattern.action),
          confidence: inferConfidence(target, sentence),
          evidence_refs: [
            {
              source_endpoint: "summary",
              source_ref: `source_text:${index + 1}`,
              quote: truncate(sentence),
            },
          ],
        });
        if (out.length >= 12) return out;
      }
    }
  }

  return out;
}

