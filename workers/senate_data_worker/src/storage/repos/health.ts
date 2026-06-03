export interface BriefingFreshnessRow {
  generated_at: string;
}

export async function readLatestBriefingGeneratedAt(
  db: D1Database
): Promise<string | null> {
  const row = await db
    .prepare("SELECT generated_at FROM daily_briefings WHERE briefing_key = ? LIMIT 1")
    .bind("latest")
    .all<BriefingFreshnessRow>();
  return row.results?.[0]?.generated_at ?? null;
}
