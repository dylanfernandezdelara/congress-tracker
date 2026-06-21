export function billLabel(type: string, number: number, congress: number): string {
  const labels: Record<string, string> = {
    HR: "H.R.",
    S: "S.",
    HRES: "H.Res.",
    SRES: "S.Res.",
    HJRES: "H.J.Res.",
    SJRES: "S.J.Res.",
    HCONRES: "H.Con.Res.",
    SCONRES: "S.Con.Res.",
  };
  const prefix = labels[type.toUpperCase()] ?? type;
  return `${prefix} ${number} (${congress}th Congress)`;
}
