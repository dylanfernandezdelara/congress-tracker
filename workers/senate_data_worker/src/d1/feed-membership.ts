import { INTRO_FEED_MAX_NEW } from "../constants";

/** Newest intro-only rows in the lookback. Voted bills stay on the vote arm. */
function introOnlyMembershipSql(): string {
  return `SELECT l.congress AS bill_congress, UPPER(l.bill_type) AS bill_type, l.bill_number,
                l.introduced_date AS sort_date, 'intro' AS source
         FROM bill_lifecycle l
         WHERE l.introduced_date >= ?
           AND NOT EXISTS (
             SELECT 1 FROM votes v
             WHERE v.is_passage = 1
               AND v.bill_congress = l.congress
               AND UPPER(v.bill_type) = UPPER(l.bill_type)
               AND v.bill_number = l.bill_number
           )
         ORDER BY l.introduced_date DESC, l.bill_number DESC
         LIMIT ?`;
}

/**
 * Vote ∪ executive ∪ intro feed membership. Select and count share this CTE so
 * a fourth source cannot drift between the two queries. Tightness/Senate-waiting
 * omit the intro arm so 7-day intros cannot evict older passage rows.
 */
export function feedMembershipCteSql(includeIntros = true): string {
  const introArm = includeIntros
    ? `
         UNION ALL
         SELECT bill_congress, bill_type, bill_number, sort_date, source
         FROM (
           ${introOnlyMembershipSql()}
         )`
    : "";
  return `WITH combined AS (
         SELECT bill_congress, UPPER(bill_type) AS bill_type, bill_number, MAX(vote_date) AS sort_date, 'vote' AS source
         FROM votes
         WHERE is_passage = 1 AND vote_date >= ?
         GROUP BY bill_congress, UPPER(bill_type), bill_number
         UNION ALL
         SELECT b.bill_congress, UPPER(b.bill_type) AS bill_type, b.bill_number, MAX(p.posted_at) AS sort_date, 'executive' AS source
         FROM executive_post_bills b
         JOIN executive_posts p ON p.id = b.post_id
         WHERE p.posted_at >= ?
         GROUP BY b.bill_congress, UPPER(b.bill_type), bill_number${introArm}
       )`;
}

export function feedMembershipBinds(
  voteLookbackDate: string,
  executiveSinceIso: string,
  introLookbackDate: string,
  includeIntros = true
): Array<string | number> {
  if (!includeIntros) return [voteLookbackDate, executiveSinceIso];
  return [voteLookbackDate, executiveSinceIso, introLookbackDate, INTRO_FEED_MAX_NEW];
}
