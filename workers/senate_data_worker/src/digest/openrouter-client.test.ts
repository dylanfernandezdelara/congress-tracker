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

  it("sums per-request costs when a batch does not report its total", async () => {
    const ok = (id: string, cost: number) => ({ custom_id: id, response: { status_code: 200, body: { choices: [{ message: { content: "{}" } }], usage: { cost } } } });
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "completed", usage: null, results: [ok("a", 0.001), ok("b", 0.002)] })));
    const state = await getBatch(env, "b1");
    expect(state.done).toBe(true);
    expect(state.cost).toBeCloseTo(0.003);
  });
});
