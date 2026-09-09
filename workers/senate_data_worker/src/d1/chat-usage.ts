import { ensureSchema } from "./schema";

export const CHAT_USAGE_GLOBAL_KEY = "*";

export type ChatUsageReservation = "ok" | "client_capped" | "global_capped";

export function utcChatDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Atomic "increment unless already at the cap": the conflict branch only fires
 * while the stored count is below `cap`, and `RETURNING` yields no row when it
 * does not, so the caller can tell a granted slot from a rejected one without
 * a separate read. Caps allow exactly `cap` turns per row per day.
 */
const CLAIM_SLOT = `INSERT INTO chat_usage (day, client_key, count)
     VALUES (?1, ?2, 1)
     ON CONFLICT(day, client_key) DO UPDATE SET count = chat_usage.count + 1
       WHERE chat_usage.count < ?3
     RETURNING count`;

const RELEASE_SLOT = `UPDATE chat_usage SET count = count - 1
     WHERE day = ?1 AND client_key = ?2 AND count > 0`;

/**
 * Reserve one chat turn for `day`. The per-client row is claimed first; only a
 * client that is under its own cap touches the site-wide row, so a capped
 * address hammering the endpoint with cheap 429s cannot walk the global
 * counter up and lock everyone else out. If the global cap rejects, the client
 * slot is released so the rejected turn is not charged anywhere.
 */
export async function reserveChatUsage(
  db: D1Database,
  params: { day: string; clientKey: string; perClientCap: number; globalCap: number }
): Promise<ChatUsageReservation> {
  await ensureSchema(db);
  const client = await db
    .prepare(CLAIM_SLOT)
    .bind(params.day, params.clientKey, params.perClientCap)
    .first<{ count: number }>();
  if (!client) return "client_capped";

  const global = await db
    .prepare(CLAIM_SLOT)
    .bind(params.day, CHAT_USAGE_GLOBAL_KEY, params.globalCap)
    .first<{ count: number }>();
  if (global) return "ok";

  await db.prepare(RELEASE_SLOT).bind(params.day, params.clientKey).run();
  return "global_capped";
}
