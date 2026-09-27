import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { chatCompletion, getBatch } from "./openrouter-client";

const env = { OPENROUTER_API_KEY: "k" } as Env;
const model = { id: "openai/gpt-6-luna", maxTokens: 100 };
const messages = { system: "s", user: "u" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("openrouter client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not retry a request error that would fail the same way (a 402 costs nothing twice)", async () => {
    const fetch = vi.fn(async () => json(402, { error: { message: "Insufficient credits" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(chatCompletion(env, model, messages)).rejects.toThrow("Insufficient credits");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a rate limit or server error once", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { id: "g1", choices: [{ message: { content: "{}" } }], usage: { cost: 0.001 } }));
    vi.stubGlobal("fetch", fetch);
    await expect(chatCompletion(env, model, messages)).resolves.toMatchObject({ content: "{}", generationId: "g1" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sums per-request costs when a batch does not report its total", async () => {
    const ok = (id: string, cost: number) => ({ custom_id: id, response: { status_code: 200, body: { choices: [{ message: { content: "{}" } }], usage: { cost } } } });
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "completed", usage: null, results: [ok("a", 0.001), ok("b", 0.002)] })));
    const state = await getBatch(env, "b1");
    expect(state.done).toBe(true);
    expect(state.cost).toBeCloseTo(0.003);
  });
});
