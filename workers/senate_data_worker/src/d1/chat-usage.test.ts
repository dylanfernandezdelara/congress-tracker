import { describe, expect, it, vi } from "vitest";

import { CHAT_USAGE_GLOBAL_KEY, reserveChatUsage, utcChatDay } from "./chat-usage";

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
          if (sql.includes("FROM chat_usage")) {
            const count = rows.get(keyOf(state.args[0], state.args[1]));
            return count === undefined ? null : { count };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.includes("INSERT INTO chat_usage")) {
            const key = keyOf(state.args[0], state.args[1]);
            rows.set(key, (rows.get(key) ?? 0) + 1);
          }
          return { success: true, meta: { changes: 1, duration: 0 } };
        },
      };
      return state;
    },
  } as unknown as D1Database;
  return { db, rows };
}

describe("reserveChatUsage", () => {
  it("accepts reservations under both caps and increments client plus global", async () => {
    const { db, rows } = usageDb();
    await expect(
      reserveChatUsage(db, {
        day: "2026-09-09",
        clientKey: "203.0.113.9",
        perClientCap: 2,
        globalCap: 5,
      })
    ).resolves.toBe("ok");
    expect(rows.get(`2026-09-09\u0000${"203.0.113.9"}`)).toBe(1);
    expect(rows.get(`2026-09-09\u0000${CHAT_USAGE_GLOBAL_KEY}`)).toBe(1);
  });

  it("returns client_capped after the per-client cap is exceeded", async () => {
    const { db } = usageDb();
    const params = {
      day: "2026-09-09",
      clientKey: "203.0.113.9",
      perClientCap: 2,
      globalCap: 50,
    };
    expect(await reserveChatUsage(db, params)).toBe("ok");
    expect(await reserveChatUsage(db, params)).toBe("ok");
    expect(await reserveChatUsage(db, params)).toBe("client_capped");
  });

  it("returns global_capped when the site-wide row exceeds its cap", async () => {
    const { db } = usageDb();
    expect(
      await reserveChatUsage(db, {
        day: "2026-09-09",
        clientKey: "a",
        perClientCap: 40,
        globalCap: 2,
      })
    ).toBe("ok");
    expect(
      await reserveChatUsage(db, {
        day: "2026-09-09",
        clientKey: "b",
        perClientCap: 40,
        globalCap: 2,
      })
    ).toBe("ok");
    expect(
      await reserveChatUsage(db, {
        day: "2026-09-09",
        clientKey: "c",
        perClientCap: 40,
        globalCap: 2,
      })
    ).toBe("global_capped");
  });

  it("formats the UTC day as YYYY-MM-DD", () => {
    expect(utcChatDay(new Date("2026-09-09T23:15:00.000Z"))).toBe("2026-09-09");
  });
});
