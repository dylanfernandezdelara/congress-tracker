/**
 * Intro feed relevance: hard-exclude junk, then soft-rank survivors.
 * Fail closed on hard title/policy rules. Fail open when soft fields are missing.
 */

export type IntroRelevanceFields = {
  title: string | null;
  policyArea: string | null;
  primarySponsorBioguide: string | null;
};

export type IntroRankKey = IntroRelevanceFields & {
  introducedDate: string;
  number: number;
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

const SUBSTANTIVE_TITLE_MATCHERS: RegExp[] = SUBSTANTIVE_TITLE_TOKENS.map((token) => {
  if (token.includes(" ")) {
    return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  if (token === "appropriat") return /\bappropriat/i;
  return new RegExp(`\\b${token}\\b`, "i");
});

const VANITY_POLICY_AREAS = new Set([
  "private legislation",
  "commemorations",
  "arts, culture, religion",
  "sports and recreation",
]);

const PRIVATE_RELIEF = /^for the relief of\b/i;
const GOLD_MEDAL = /congressional gold medal/i;
const GOLD_MEDAL_ACT = /gold medal act\b/i;
const COMMEMORATIVE_TOKEN = /commemorative (coin|medal|stamp)/i;
const COMMEMORATIVE_ACT = /commemorative (coin|medal|stamp) act\b/i;

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
  return SUBSTANTIVE_TITLE_MATCHERS.some((re) => re.test(title));
}

/**
 * Facility designation/naming only — not USPS policy bills that happen to
 * mention the Postal Service plus designate/name.
 */
function isPostalFacilityNamingTitle(title: string): boolean {
  const t = title.toLowerCase();
  const namesFacility =
    /facility of the (united states )?postal service/.test(t) ||
    /\busps facility\b/.test(t) ||
    /post office building/.test(t);
  if (!namesFacility) return false;
  return /designat|nam(?:e|ing)\b/.test(t);
}

/**
 * Drop when the title *is* the honor. A named Act that only mentions the honor
 * survives (mention ≠ vehicle). A “… Honor Act” survives only if leftover
 * tokens are still a named Act with a substantive word.
 */
function isHonorOnlyTitle(title: string, honor: RegExp, honorIsTheAct: RegExp): boolean {
  if (!honor.test(title)) return false;
  if (hasNamedActShape(title) && !honorIsTheAct.test(title)) return false;
  const remainder = title.replace(honor, " ");
  return !(hasNamedActShape(remainder) && hasSubstantiveTitleToken(remainder));
}

export function isOnlyCongressionalGoldMedal(title: string): boolean {
  return isHonorOnlyTitle(title, GOLD_MEDAL, GOLD_MEDAL_ACT);
}

export function isOnlyCommemorativeHonor(title: string): boolean {
  return isHonorOnlyTitle(title, COMMEMORATIVE_TOKEN, COMMEMORATIVE_ACT);
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

export function rankIntro(item: IntroRankKey): {
  score: number;
  introducedDate: string;
  number: number;
} {
  return {
    score: scoreIntroRelevance(item),
    introducedDate: item.introducedDate,
    number: item.number,
  };
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

export function compareIntroItems(a: IntroRankKey, b: IntroRankKey): number {
  return compareIntroRelevance(rankIntro(a), rankIntro(b));
}

/** Rank then cap. Soft score never drops an under-cap survivor. */
export function selectIntroPersistSet<T extends IntroRankKey>(items: T[], maxNew: number): T[] {
  return [...items].sort(compareIntroItems).slice(0, maxNew);
}

function sqlStringLit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNormalizedTitle(titleExpr: string): string {
  return `(' ' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${titleExpr}, ''), ',', ' '), '.', ' '), '-', ' '), ':', ' ')) || ' ')`;
}

/**
 * SQLite expression matching {@link scoreIntroRelevance} so the feed UNION
 * can ORDER BY the same rank the persist cap uses.
 */
export function introRelevanceScoreSql(
  titleExpr: string,
  policyExpr: string,
  bioguideExpr: string
): string {
  const titleNorm = sqlNormalizedTitle(titleExpr);
  const actShape = `(${titleNorm} LIKE '% act %' AND LOWER(TRIM(COALESCE(${titleExpr}, ''))) NOT LIKE 'to amend%' AND LOWER(TRIM(COALESCE(${titleExpr}, ''))) NOT LIKE 'a bill to amend%')`;
  const tokenMatch = `(${SUBSTANTIVE_TITLE_TOKENS.map((token) => {
    if (token.includes(" ")) {
      return `LOWER(COALESCE(${titleExpr}, '')) LIKE ${sqlStringLit(`%${token}%`)}`;
    }
    if (token === "appropriat") {
      return `LOWER(COALESCE(${titleExpr}, '')) LIKE '%appropriat%'`;
    }
    return `${titleNorm} LIKE ${sqlStringLit(`% ${token} %`)}`;
  }).join(" OR ")})`;
  const bios = [...PROMINENT_INTRO_SPONSOR_BIOGUIDES].map(sqlStringLit).join(", ");
  const sponsor = `(UPPER(TRIM(COALESCE(${bioguideExpr}, ''))) IN (${bios}))`;
  const vanity = [...VANITY_POLICY_AREAS].map(sqlStringLit).join(", ");
  const policyBoost = `(TRIM(COALESCE(${policyExpr}, '')) != '' AND LOWER(TRIM(${policyExpr})) NOT IN (${vanity}))`;
  return `(CASE WHEN ${actShape} THEN 3 ELSE 0 END + CASE WHEN ${tokenMatch} THEN 2 ELSE 0 END + CASE WHEN ${sponsor} THEN 2 ELSE 0 END + CASE WHEN ${policyBoost} THEN 1 ELSE 0 END)`;
}
