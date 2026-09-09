import { ensureSchema } from "./schema";

export const CHAT_USAGE_GLOBAL_KEY = "*";

export type ChatUsageReservation = "ok" | "client_capped" | "global_capped";

export function utcChatDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Increment the per-client and site-wide counters for `day`, then read them
 * back. A request that crosses a cap still consumes the reserved slot.
 */
export async function reserveChatUsage(
  db: D1Database,
  params: { day: string; clientKey: string; perClientCap: number; globalCap: number }
): Promise<ChatUsageReservation> {
  await ensureSchema(db);
  const upsert = `INSERT INTO chat_usage (day, client_key, count)
       VALUES (?1, ?2, 1)
       ON CONFLICT(day, client_key) DO UPDATE SET count = chat_usage.count + 1`;
  await db.prepare(upsert).bind(params.day, params.clientKey).run();
  await db.prepare(upsert).bind(params.day, CHAT_USAGE_GLOBAL_KEY).run();

  const clientRow = await db
    .prepare(`SELECT count FROM chat_usage WHERE day = ?1 AND client_key = ?2`)
    .bind(params.day, params.clientKey)
    .first<{ count: number }>();
  const globalRow = await db
    .prepare(`SELECT count FROM chat_usage WHERE day = ?1 AND client_key = ?2`)
    .bind(params.day, CHAT_USAGE_GLOBAL_KEY)
    .first<{ count: number }>();

  const clientCount = clientRow?.count ?? 0;
  const globalCount = globalRow?.count ?? 0;
  if (clientCount > params.perClientCap) return "client_capped";
  if (globalCount > params.globalCap) return "global_capped";
  return "ok";
}
