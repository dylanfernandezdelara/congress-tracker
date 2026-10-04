import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { chatCompletion, getBatch, submitBatch } from "./openrouter-client";

const env = { OPENROUTER_API_KEY: "k" } as Env;
const model = { id: "openai/gpt-6-luna", maxTokens: 100 };
const messages = { system: "s", user: "u" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("openrouter client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not retry a request error that would fail the same way (a 402 costs nothing twice)", async () => {
    const fetch = vi.fn(async () => json(402, { error: { message: "Insufficient credits" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(chatCompletion(env, model, messages)).rejects.toThrow("OpenRouter account: Insufficient credits");
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

  it("sends the gateway token to the gateway only, and returns the gateway's log id", async () => {
    const ok = () =>
      new Response(JSON.stringify({ id: "g1", choices: [{ message: { content: "{}" } }], usage: { cost: 0.001 } }), {
        status: 200,
        headers: { "cf-aig-log-id": "01LOG" },
      });
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const gateway = "https://gateway.ai.cloudflare.com/v1/acct/trackcongress/openrouter/v1";

    const viaGateway = await chatCompletion({ ...env, OPENROUTER_BASE_URL: gateway, CF_AIG_TOKEN: "aig" } as Env, model, messages);
    await chatCompletion({ ...env, CF_AIG_TOKEN: "aig" } as Env, model, messages);

    const [gatewayUrl, gatewayInit] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const [directUrl, directInit] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(gatewayUrl).toBe(`${gateway}/chat/completions`);
    expect((gatewayInit.headers as Record<string, string>)["cf-aig-authorization"]).toBe("Bearer aig");
    expect(directUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((directInit.headers as Record<string, string>)["cf-aig-authorization"]).toBeUndefined();
    expect(viaGateway.gatewayLogId).toBe("01LOG");
  });

  it("names the gateway when it refuses the token, and never sends batches through it", async () => {
    const gatewayEnv = { ...env, OPENROUTER_BASE_URL: "https://gateway.ai.cloudflare.com/v1/acct/trackcongress/openrouter/v1", CF_AIG_TOKEN: "aig" } as Env;
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { success: false, errors: [{ code: 2009, message: "Unauthorized" }] })));
    await expect(chatCompletion(gatewayEnv, model, messages)).rejects.toThrow("AI Gateway: HTTP 401");

    const fetch = vi.fn(async () => json(200, { id: "batch-1" }));
    vi.stubGlobal("fetch", fetch);
    await submitBatch(gatewayEnv, model, [{ customId: "a", messages }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/batches");
    expect((init.headers as Record<string, string>)["cf-aig-authorization"]).toBeUndefined();
  });

  it("sums per-request costs when a batch does not report its total", async () => {
    const ok = (id: string, cost: number) => ({ custom_id: id, response: { status_code: 200, body: { choices: [{ message: { content: "{}" } }], usage: { cost } } } });
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "completed", usage: null, results: [ok("a", 0.001), ok("b", 0.002)] })));
    const state = await getBatch(env, "b1");
    expect(state.done).toBe(true);
    expect(state.cost).toBeCloseTo(0.003);
  });

  describe("spend hook", () => {
    const timeout = () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const ok = (cost?: number) => json(200, { id: "g1", choices: [{ message: { content: "{}" } }], ...(cost === undefined ? {} : { usage: { cost } }) });
    const hook = (estimate = 0.05) => {
      const records: number[] = [];
      return { records, total: () => records.reduce((n, r) => n + r, 0), spend: { estimate, record: async (usd: number) => void records.push(usd) } };
    };

    it("keeps a timed-out attempt's estimate, and settles only the attempt that answered to its actual charge", async () => {
      const fetch = vi.fn().mockImplementationOnce(timeout).mockResolvedValueOnce(ok(0.012));
      vi.stubGlobal("fetch", fetch);
      const { records, total, spend } = hook();

      await expect(chatCompletion(env, model, messages, spend)).resolves.toMatchObject({ usage: { cost: 0.012 } });

      expect(fetch).toHaveBeenCalledTimes(2);
      // An estimate before each attempt, then the answered attempt's correction: the timeout may have been billed.
      expect(records.slice(0, 2)).toEqual([0.05, 0.05]);
      expect(records).toHaveLength(3);
      expect(total()).toBeCloseTo(0.05 + 0.012, 9);
    });

    it("keeps one estimate per attempt when every attempt times out, since the provider may bill each", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(timeout));
      const { records, spend } = hook();

      await expect(chatCompletion(env, model, messages, spend)).rejects.toThrow("timeout");

      expect(records).toEqual([0.05, 0.05]);
    });

    it("keeps the estimate of a 5xx (the provider may finish and bill), and takes back a refusal that generated nothing", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(ok(0.002)));
      const serverError = hook();
      await chatCompletion(env, model, messages, serverError.spend);
      expect(serverError.total()).toBeCloseTo(0.05 + 0.002, 9);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(524, {})).mockImplementationOnce(timeout));
      const gatewayTimeout = hook();
      await expect(chatCompletion(env, model, messages, gatewayTimeout.spend)).rejects.toThrow();
      expect(gatewayTimeout.records).toEqual([0.05, 0.05]);

      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(429, {})).mockResolvedValueOnce(ok(0.002)));
      const rateLimited = hook();
      await chatCompletion(env, model, messages, rateLimited.spend);
      expect(rateLimited.records.slice(0, 2)).toEqual([0.05, -0.05]);
      expect(rateLimited.total()).toBeCloseTo(0.002, 9);

      vi.stubGlobal("fetch", vi.fn(async () => json(402, { error: { message: "Insufficient credits" } })));
      const refused = hook();
      await expect(chatCompletion(env, model, messages, refused.spend)).rejects.toThrow("Insufficient credits");
      expect(refused.records).toEqual([0.05, -0.05]);
    });

    it("keeps one estimate when a reply carries no cost", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ok()));
      const { total, spend } = hook();
      await chatCompletion(env, model, messages, spend);
      expect(total()).toBeCloseTo(0.05, 9);
    });

    it("sends nothing when the estimate cannot be recorded", async () => {
      const fetch = vi.fn(async () => ok(0.01));
      vi.stubGlobal("fetch", fetch);
      const spend = { estimate: 0.05, record: async () => Promise.reject(new Error("D1 down")) };
      await expect(chatCompletion(env, model, messages, spend)).rejects.toThrow("D1 down");
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
