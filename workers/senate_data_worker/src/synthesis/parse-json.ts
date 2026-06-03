import type {
  AnalysisQuality,
  BillAnalysis,
  BillAnalysisClaimRef,
  BillImpactEvidence,
  BillRef,
  LikelyReason,
  LikelyReasonCategory,
  PartyPositionAnalysis,
  PolicyDelta,
  StakeholderImpact,
} from "../types";

function stripThinkTagsAndFences(text: string): string {
  let out = text.trim();
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenceMatch = out.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) out = fenceMatch[1].trim();
  return out;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaping) escaping = false;
      else if (ch === "\\") escaping = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseModelJson(content: string): unknown {
  const cleaned = stripThinkTagsAndFences(content).trim();
  if (!cleaned) throw new Error("Empty model content");
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonChunk = extractFirstJsonObject(cleaned);
    if (!jsonChunk) throw new Error("No JSON object found in model output");
    return JSON.parse(jsonChunk);
  }
}
