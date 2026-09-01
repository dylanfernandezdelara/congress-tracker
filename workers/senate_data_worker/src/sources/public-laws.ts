import { normalizeBillType } from "./bill-type";
import {
  parseLifecycleActions,
  type ParsedLifecycleMilestones,
} from "../lifecycle/parse-actions";

export interface PublicLawRecord {
  congress: number;
  billType: string;
  billNumber: number;
  title: string | null;
  becameLawDate: string;
  publicLaw: string;
  latestActionText: string | null;
  milestones: ParsedLifecycleMilestones;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function isoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function publicLawNumber(bill: Record<string, unknown>, actionText: string | null): string | null {
  const laws = bill.laws;
  if (Array.isArray(laws)) {
    for (const entry of laws) {
      const row = asRecord(entry);
      if (!row) continue;
      const kind = asString(row.type);
      if (kind && !/public/i.test(kind)) continue;
      const number = asString(row.number);
      if (number) return number;
    }
  }
  if (!actionText) return null;
  const match = actionText.match(/Became Public Law No:\s*([\d-]+)/i);
  return match?.[1] ?? null;
}

export function parsePublicLawBill(raw: unknown): PublicLawRecord | null {
  const bill = asRecord(raw);
  if (!bill) return null;

  const congress = asPositiveInt(bill.congress);
  const typeRaw = asString(bill.type);
  const billNumber = asPositiveInt(bill.number);
  if (congress == null || !typeRaw || billNumber == null) return null;

  const latestAction = asRecord(bill.latestAction);
  const actionDate = isoDate(latestAction?.actionDate);
  const actionText = asString(latestAction?.text);
  if (!actionDate) return null;

  const publicLaw = publicLawNumber(bill, actionText);
  if (!publicLaw) return null;

  const milestones = parseLifecycleActions([
    {
      actionDate,
      text: actionText,
    },
  ]);

  return {
    congress,
    billType: normalizeBillType(typeRaw),
    billNumber,
    title: asString(bill.title),
    becameLawDate: milestones.became_law_date ?? actionDate,
    publicLaw: milestones.public_law ?? publicLaw,
    latestActionText: actionText,
    milestones: {
      ...milestones,
      became_law_date: milestones.became_law_date ?? actionDate,
      public_law: milestones.public_law ?? publicLaw,
      latest_action_date: milestones.latest_action_date ?? actionDate,
      latest_action_text: milestones.latest_action_text ?? actionText,
    },
  };
}

export function parsePublicLawsPage(data: unknown): {
  laws: PublicLawRecord[];
  nextUrl: string | null;
} {
  const root = asRecord(data);
  const bills = Array.isArray(root?.bills) ? root.bills : [];
  const laws: PublicLawRecord[] = [];
  const seen = new Set<string>();
  for (const bill of bills) {
    const parsed = parsePublicLawBill(bill);
    if (!parsed) continue;
    const key = `${parsed.congress}:${parsed.billType}:${parsed.billNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    laws.push(parsed);
  }

  const pagination = asRecord(root?.pagination);
  const nextUrl = asString(pagination?.next);

  return { laws, nextUrl };
}
