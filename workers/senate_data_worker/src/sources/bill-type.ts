/** Canonical bill type for comparisons and LLM output (e.g. HR, S, HRES). */
export function normalizeBillType(type: string): string {
  return type.trim().toUpperCase().replace(/\./g, "");
}
