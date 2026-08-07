import { ensureSchema } from "./schema";

/** Distinct non-empty policy areas from digests, A–Z (for feed filter selects). */
export async function listPolicyAreas(db: D1Database): Promise<string[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT DISTINCT policy_area AS policy_area
       FROM bill_digests
       WHERE policy_area IS NOT NULL
         AND TRIM(policy_area) != ''
       ORDER BY policy_area COLLATE NOCASE ASC`
    )
    .all<{ policy_area: string }>();

  return (results ?? [])
    .map((row) => row.policy_area.trim())
    .filter((value) => value.length > 0);
}
