import type {
  ExecutiveBillLink,
  ExecutiveBillRole,
  ExecutiveCatalogBill,
  ExecutiveLinkLlmResult,
} from "../../../../shared/executive-api-types";
import { EXECUTIVE_LINK_MIN_CONFIDENCE } from "../constants";
import type { BillRef } from "../types";
import { parseSenateIssue } from "../sources/bill-ref";

const VALID_ROLES: ExecutiveBillRole[] = [
  "primary",
  "conditional",
  "related",
  "mentioned",
];

export function billRefKey(bill: BillRef): string {
  return `${bill.congress}:${bill.type}:${bill.number}`;
}

export function parseExecutiveLinkJson(text: string): ExecutiveLinkLlmResult | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1]!.trim();
  try {
    const parsed = JSON.parse(raw) as ExecutiveLinkLlmResult;
    if (!parsed.banner_summary?.trim() || !Array.isArray(parsed.linked_bills)) return null;
    parsed.banner_summary = parsed.banner_summary.trim();
    parsed.informal = parsed.informal ?? true;
    parsed.linked_bills = parsed.linked_bills
      .filter((b) => b.congress && b.type && b.number && b.role && typeof b.confidence === "number")
      .map((b) => ({
        ...b,
        type: b.type.toUpperCase(),
        role: b.role as ExecutiveBillRole,
      }));
    return parsed;
  } catch {
    return null;
  }
}

export function extractExplicitBillRefs(text: string, congress: number): BillRef[] {
  const refs: BillRef[] = [];
  const patterns = [
    /\bH\.?\s*R\.?\s*(\d+)\b/gi,
    /\bS\.?\s*(\d+)\b/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const issue = match[0].toUpperCase().includes("H") && match[0].toUpperCase().includes("R")
        ? `H.R. ${match[1]}`
        : `S. ${match[1]}`;
      const ref = parseSenateIssue(issue, congress);
      if (ref) refs.push(ref);
    }
  }
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = billRefKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSecureAmericaConfusion(postText: string, link: ExecutiveBillLink): boolean {
  const lower = postText.toLowerCase();
  if (link.type === "HR" && link.number === 22 && lower.includes("secure america act")) {
    return true;
  }
  if (link.type === "S" && link.number === 2) {
    if (lower.includes("save america act") || lower.includes("save act")) {
      return true;
    }
    if (/\bs\.?\s*2\b/i.test(postText) && !lower.includes("secure america")) {
      return false;
    }
  }
  return false;
}

export function applyExecutiveLinkGuardrails(
  postText: string,
  llm: ExecutiveLinkLlmResult,
  catalog: ExecutiveCatalogBill[]
): ExecutiveLinkLlmResult | null {
  const filtered = llm.linked_bills.filter((link) => {
    if (link.confidence < EXECUTIVE_LINK_MIN_CONFIDENCE) return false;
    if (!VALID_ROLES.includes(link.role)) return false;
    if (isSecureAmericaConfusion(postText, link)) return false;
    if (!Number.isFinite(link.congress) || !link.type || !Number.isFinite(link.number)) return false;
    return true;
  });

  const explicit = extractExplicitBillRefs(postText, catalog[0]?.congress ?? 119);
  for (const ref of explicit) {
    const key = billRefKey(ref);
    if (!filtered.some((l) => billRefKey(l) === key)) {
      filtered.push({
        congress: ref.congress,
        type: ref.type,
        number: ref.number,
        role: filtered.length === 0 ? "primary" : "related",
        confidence: 1,
        rationale: "Explicit bill number in post",
      });
    }
  }

  if (filtered.length === 0) return null;

  let primaryCount = filtered.filter((l) => l.role === "primary").length;
  if (primaryCount === 0) {
    filtered[0] = { ...filtered[0]!, role: "primary" };
    primaryCount = 1;
  }
  if (primaryCount > 1) {
    let keptPrimary = false;
    for (let i = 0; i < filtered.length; i += 1) {
      if (filtered[i]!.role === "primary") {
        if (!keptPrimary) keptPrimary = true;
        else filtered[i] = { ...filtered[i]!, role: "related" };
      }
    }
  }

  return {
    banner_summary: llm.banner_summary,
    informal: llm.informal ?? true,
    linked_bills: filtered,
  };
}

export function buildExecutiveCatalogEntry(
  bill: BillRef,
  title: string | null,
  headline: string | null,
  policyArea: string | null
): ExecutiveCatalogBill {
  return {
    congress: bill.congress,
    type: bill.type,
    number: bill.number,
    title,
    headline,
    policy_area: policyArea,
  };
}
