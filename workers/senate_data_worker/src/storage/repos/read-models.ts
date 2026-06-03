export async function hasPublishedReadModels(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare("SELECT briefing_key FROM daily_briefings WHERE briefing_key = ? LIMIT 1")
    .bind("latest")
    .all<{ briefing_key: string }>();
  return (row.results?.length ?? 0) > 0;
}
