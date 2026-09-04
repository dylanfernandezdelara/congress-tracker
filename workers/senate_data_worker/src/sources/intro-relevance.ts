/**
 * Intro feed relevance: hard-exclude junk, then soft-rank survivors.
 * Fail closed on hard title/policy rules. Fail open when soft fields are missing.
 */

export type IntroRelevanceFields = {
  title: string | null;
  policyArea: string | null;
  primarySponsorBioguide: string | null;
};

/**
 * Small prominence set for intro ranking (+2). Household names plus chamber
 * floor leadership — not a completeness roster.
 *
 * - S000033 Sanders, C001125 Casar (Ban ASI sponsors)
 * - S000148 Schumer, T000250 Thune
 * - J000299 Mike Johnson, J000294 Jeffries, S001176 Scalise
 * - P000197 Pelosi, M000355 McConnell
 * - O000172 Ocasio-Cortez, W000817 Warren, C001098 Cruz
 */
export const PROMINENT_INTRO_SPONSOR_BIOGUIDES = new Set([
  "S000033",
  "C001125",
  "S000148",
  "T000250",
  "J000299",
  "J000294",
  "S001176",
  "P000197",
  "M000355",
  "O000172",
  "W000817",
  "C001098",
]);

/** Prefix / phrase tokens that mark a substantive short title. */
export const SUBSTANTIVE_TITLE_TOKENS = [
  "ban",
  "prohibit",
  "authorize",
  "appropriat",
  "tax",
  "health",
  "immigration",
  "artificial intelligence",
  "superintelligence",
  "national security",
  "repeal",
  "climate",
  "medicaid",
  "medicare",
  "veteran",
  "housing",
  "energy",
  "privacy",
  "antitrust",
  "firearm",
  "border",
  "tariff",
] as const;

const VANITY_POLICY_AREAS = new Set([
  "private legislation",
  "commemorations",
  "arts, culture, religion",
  "sports and recreation",
]);

const PRIVATE_RELIEF = /^for the relief of\b/i;
const COMMEMORATIVE_TOKEN = /commemorative (coin|medal|stamp)/i;
const GOLD_MEDAL = /congressional gold medal/i;

function normalizePolicy(policyArea: string | null): string | null {
  const trimmed = policyArea?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function isVanityAdjacentPolicy(policyArea: string | null): boolean {
  const policy = normalizePolicy(policyArea);
  return policy != null && VANITY_POLICY_AREAS.has(policy);
}

export function isPrivateLegislationPolicy(policyArea: string | null): boolean {
  return normalizePolicy(policyArea) === "private legislation";
}

/** Named/short-title Act — not a bare “To amend …” vehicle. */
export function hasNamedActShape(title: string | null): boolean {
  if (!title) return false;
  if (!/\bAct\b/i.test(title)) return false;
  return !/^(a bill\s+)?to amend\b/i.test(title.trim());
}

export function hasSubstantiveTitleToken(title: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return SUBSTANTIVE_TITLE_TOKENS.some((token) => {
    if (token.includes(" ")) return t.includes(token);
    if (token === "appropriat") return /\bappropriat/.test(t);
    return new RegExp(`\\b${token}\\b`, "i").test(title);
  });
}

function isPostalFacilityNamingTitle(title: string): boolean {
  const t = title.toLowerCase();
  const namesFacility =
    /united states postal service/.test(t) || /\busps\b/.test(t) || /post office building/.test(t);
  if (!namesFacility) return false;
  return /designat|nam(?:e|ing)\b/.test(t);
}

/**
 * Congressional Gold Medal when the title is only that honor.
 * A named Act that is not just “… Gold Medal Act” can still survive.
 */
export function isOnlyCongressionalGoldMedal(title: string): boolean {
  if (!GOLD_MEDAL.test(title)) return false;
  const trimmed = title.trim();
  if (/gold medal act\b/i.test(trimmed) && /^(a bill\s+)?to\b/i.test(trimmed) === false) {
    const withoutHonor = trimmed.replace(/congressional gold medal/gi, " ");
    if (hasSubstantiveTitleToken(withoutHonor) && hasNamedActShape(withoutHonor)) return false;
  }
  if (hasNamedActShape(trimmed) && !/gold medal act\b/i.test(trimmed)) return false;
  return true;
}

/** Commemorative coin/medal/stamp when that honor is the whole title. */
export function isOnlyCommemorativeHonor(title: string): boolean {
  if (!COMMEMORATIVE_TOKEN.test(title)) return false;
  const withoutHonor = title.replace(/commemorative (coin|medal|stamp)/gi, " ");
  if (hasNamedActShape(title) && hasSubstantiveTitleToken(withoutHonor)) return false;
  return true;
}

export function isJunkIntroTitle(title: string | null): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (PRIVATE_RELIEF.test(trimmed)) return true;
  if (isPostalFacilityNamingTitle(trimmed)) return true;
  if (isOnlyCommemorativeHonor(trimmed)) return true;
  if (isOnlyCongressionalGoldMedal(trimmed)) return true;
  return false;
}

/** Fail closed: drop private-relief / naming / vanity honors. Missing title is not junk. */
export function isHardExcludedIntro(fields: IntroRelevanceFields): boolean {
  if (isPrivateLegislationPolicy(fields.policyArea)) return true;
  return isJunkIntroTitle(fields.title);
}

/**
 * Soft rank only. A low score never drops a bill that survived hard excludes;
 * the persist/UNION cap (12) takes the highest-ranked survivors.
 */
export function scoreIntroRelevance(fields: IntroRelevanceFields): number {
  let score = 0;
  if (hasNamedActShape(fields.title)) score += 3;
  if (hasSubstantiveTitleToken(fields.title)) score += 2;
  const bioguide = fields.primarySponsorBioguide?.trim().toUpperCase() ?? "";
  if (bioguide && PROMINENT_INTRO_SPONSOR_BIOGUIDES.has(bioguide)) score += 2;
  if (fields.policyArea && !isVanityAdjacentPolicy(fields.policyArea)) score += 1;
  return score;
}

export function compareIntroRelevance(
  a: { score: number; introducedDate: string; number: number },
  b: { score: number; introducedDate: string; number: number }
): number {
  if (b.score !== a.score) return b.score - a.score;
  const byDate = b.introducedDate.localeCompare(a.introducedDate);
  if (byDate !== 0) return byDate;
  return b.number - a.number;
}
