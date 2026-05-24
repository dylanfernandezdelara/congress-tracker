export function normalizeHistoricalBillType(rawType: string): string {
  const normalized = rawType.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "HR") return "H.R.";
  if (normalized === "S") return "S";
  if (normalized === "HJRES") return "H.J.RES.";
  if (normalized === "SJRES") return "S.J.RES.";
  if (normalized === "HCONRES") return "H.CON.RES.";
  if (normalized === "SCONRES") return "S.CON.RES.";
  if (normalized === "HRES") return "H.RES.";
  if (normalized === "SRES") return "S.RES.";
  return rawType.toUpperCase();
}
