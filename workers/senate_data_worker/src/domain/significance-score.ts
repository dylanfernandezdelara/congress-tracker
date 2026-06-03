import type { SignificanceLevel } from "../platform-types";

const SIGNIFICANCE_SCORES: Record<SignificanceLevel, number> = {
  high: 80,
  medium: 50,
  low: 20,
};

export function significanceToScore(significance: SignificanceLevel): number {
  return SIGNIFICANCE_SCORES[significance];
}

export function buildImportanceReasonsJson(
  significance: SignificanceLevel,
  significanceReason?: string
): string {
  const reasons: string[] = [significance];
  const detail = significanceReason?.trim();
  if (detail) reasons.push(detail);
  return JSON.stringify(reasons);
}
