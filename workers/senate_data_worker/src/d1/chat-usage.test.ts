import { describe, expect, it, vi } from "vitest";

import { CHAT_USAGE_GLOBAL_KEY, reserveChatUsage, utcChatDay } from "./chat-usage";

/**
 * In-memory stand-in for the `chat_usage` table that honours the conditional
 * upsert (`WHERE count < cap ... RETURNING count`) and the release UPDATE.
 */
function usageDb() {
  const rows = new Map<string, number>();
  const keyOf = (day: unknown, client: unknown) => `${String(day)}\u0000${String(client)}`;
  const db = {
    exec: vi.fn(async () => {}),
    prepare(sql: string) {
      const state = {
        args: [] as unknown[],
        bind: (...args: unknown[]) => {
          state.args = args;
          return state;
        },
        first: async () => {
          if (sql.includes("INSERT INTO chat_usage")) {
            const key = keyOf(state.args[0], state.args[1]);
            const cap = Number(state.args[2]);
            const current = rows.get(key);
            if (current === undefined) {
              rows.set(key, 1);
              return { count: 1 };
            }
            if (current >= cap) return null;
            rows.set(key, current + 1);
            return { count: current + 1 };
          }
          if (sql.includes("FROM chat_usage")) {
            const count = rows.get(keyOf(state.args[0], state.args[1]));
            return count === undefined ? null : { count };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.includes("UPDATE chat_usage SET count = count - 1")) {
            const key = keyOf(state.args[0], state.args[1]);
            const current = rows.get(key) ?? 0;
            if (current > 0) rows.set(key, current - 1);
          }
          return { success: true, meta: { changes: 1, duration: 0 } };
        },
      };
      return state;
    },
  } as unknown as D1Database;
  const count = (client: string, day = "2026-09-09") => rows.get(keyOf(day, client)) ?? 0;
  return { db, count };
}

const DAY = "2026-09-09";

describe("reserveChatUsage", () => {
  it("accepts reservations under both caps and increments client plus global", async () => {
    const { db, count } = usageDb();
    await expect(
      reserveChatUsage(db, { day: DAY, clientKey: "203.0.113.9", perClientCap: 2, globalCap: 5 })
    ).resolves.toBe("ok");
    expect(count("203.0.113.9")).toBe(1);
    expect(count(CHAT_USAGE_GLOBAL_KEY)).toBe(1);
  });

  it("returns client_capped after the per-client cap is exhausted", async () => {
    const { db, count } = usageDb();
    const params = { day: DAY, clientKey: "203.0.113.9", perClientCap: 2, globalCap: 50 };
    expect(await reserveChatUsage(db, params)).toBe("ok");
    expect(await reserveChatUsage(db, params)).toBe("ok");
    expect(await reserveChatUsage(db, params)).toBe("client_capped");
    expect(count("203.0.113.9")).toBe(2);
  });

  it("does not charge the site-wide counter for turns a capped client is refused", async () => {
    const { db, count } = usageDb();
    const params = { day: DAY, clientKey: "203.0.113.9", perClientCap: 1, globalCap: 50 };
    expect(await reserveChatUsage(db, params)).toBe("ok");
    for (let i = 0; i < 25; i++) {
      expect(await reserveChatUsage(db, params)).toBe("client_capped");
    }
    expect(count(CHAT_USAGE_GLOBAL_KEY)).toBe(1);
    // Another address is unaffected by the capped client's retries.
    expect(
      await reserveChatUsage(db, { ...params, clientKey: "198.51.100.7", perClientCap: 40 })
    ).toBe("ok");
  });

  it("returns global_capped when the site-wide row is exhausted and releases the client slot", async () => {
    const { db, count } = usageDb();
    const base = { day: DAY, perClientCap: 40, globalCap: 2 };
    expect(await reserveChatUsage(db, { ...base, clientKey: "a" })).toBe("ok");
    expect(await reserveChatUsage(db, { ...base, clientKey: "b" })).toBe("ok");
    expect(await reserveChatUsage(db, { ...base, clientKey: "c" })).toBe("global_capped");
    expect(count("c")).toBe(0);
    expect(count(CHAT_USAGE_GLOBAL_KEY)).toBe(2);
  });

  it("formats the UTC day as YYYY-MM-DD", () => {
    expect(utcChatDay(new Date("2026-09-09T23:15:00.000Z"))).toBe("2026-09-09");
  });
});
