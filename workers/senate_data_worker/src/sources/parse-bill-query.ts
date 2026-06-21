import type { BillRef } from "../types";

const BILL_QUERY_PATTERN =
  /^(H\.?\s*R\.?|H\.?\s*RES\.?|H\.?\s*J\.?\s*RES\.?|H\.?\s*CON\.?\s*RES\.?|S\.?|S\.?\s*RES\.?|S\.?\s*J\.?\s*RES\.?|S\.?\s*CON\.?\s*RES\.?)\s*(\d+)\.?$/i;

function normalizeBillType(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").replace(/\./g, "").toUpperCase();
  if (compact === "HR") return "HR";
  if (compact === "HRES") return "HRES";
  if (compact === "HJRES") return "HJRES";
  if (compact === "HCONRES") return "HCONRES";
  if (compact === "S") return "S";
  if (compact === "SRES") return "SRES";
  if (compact === "SJRES") return "SJRES";
  if (compact === "SCONRES") return "SCONRES";
  return null;
}

export function parseBillQuery(raw: string, congress: number): BillRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(BILL_QUERY_PATTERN);
  if (!match) return null;

  const type = normalizeBillType(match[1]);
  const number = Number.parseInt(match[2], 10);
  if (!type || Number.isNaN(number) || number <= 0) return null;

  return { congress, type, number };
}

export function parseBillQueryList(values: string[], congress: number): BillRef[] {
  const seen = new Set<string>();
  const bills: BillRef[] = [];

  for (const value of values) {
    for (const part of value.split(",")) {
      const bill = parseBillQuery(part, congress);
      if (!bill) continue;
      const key = `${bill.congress}:${bill.type}:${bill.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bills.push(bill);
    }
  }

  return bills;
}
