import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { anthropicCompletion } from "./anthropic-client";
import { rewriteModel } from "./models";
import { AccountError } from "./openrouter-client";

const env = { OPENROUTER_API_KEY: "k", ANTHROPIC_API_KEY: "ak", DIGEST_REWRITE_MODEL: "claude-sonnet-5-5" } as Env;
const model = rewriteModel(env);
const messages = { system: "s", user: "u" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const reply = (text: string, stop = "end_turn") =>
  json(200, {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text }],
    stop_reason: stop,
    usage: { input_tokens: 5_000, output_tokens: 1_000 },
  });
const apiError = (status: number, type: string, message: string) => json(status, { type: "error", error: { type, message } });

describe("anthropic client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is chosen by an Anthropic id in DIGEST_REWRITE_MODEL, with effort instead of temperature", () => {
    expect(model).toMatchObject({ id: "claude-sonnet-5-5", provider: "anthropic", effort: "medium", price: { input: 2, output: 10 } });
    expect(model.temperature).toBeUndefined();
    expect(rewriteModel({} as Env)).toMatchObject({ id: "anthropic/claude-sonnet-5", temperature: 0.2 });
    expect(rewriteModel({} as Env).provider).toBeUndefined();
  });

  it("sends the key, model, effort and system prompt, and prices the reply from its usage", async () => {
    const fetch = vi.fn(async () => reply('{"headline":"h"}'));
    vi.stubGlobal("fetch", fetch);
    const res = await anthropicCompletion(env, model, messages);
    expect(res).toMatchObject({ content: '{"headline":"h"}', generationId: "msg_1", gatewayLogId: null });
    // 5k in × $2 + 1k out × $10, per million.
    expect(res.usage.cost).toBeCloseTo(0.02, 6);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(init.headers).get("x-api-key")).toBe("ak");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 16_000, output_config: { effort: "medium" }, system: "s" });
    expect(body.messages).toEqual([{ role: "user", content: "u" }]);
    expect(body.temperature).toBeUndefined();
  });

  it("returns no content for a refusal or a reply cut off at max_tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("{", "max_tokens")));
    expect((await anthropicCompletion(env, model, messages)).content).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => reply("", "refusal")));
    expect((await anthropicCompletion(env, model, messages)).content).toBeNull();
  });

  it("does not retry an account error, and names Anthropic", async () => {
    const fetch = vi.fn(async () => apiError(401, "authentication_error", "invalid x-api-key"));
    vi.stubGlobal("fetch", fetch);
    const err = await anthropicCompletion(env, model, messages).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccountError);
    expect((err as Error).message).toContain("Anthropic account:");
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(anthropicCompletion({ ...env, ANTHROPIC_API_KEY: undefined } as Env, model, messages)).rejects.toThrow("ANTHROPIC_API_KEY is not set");
  });

  it("retries an overloaded or server error once", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(apiError(529, "overloaded_error", "Overloaded")).mockResolvedValueOnce(reply("{}"));
    vi.stubGlobal("fetch", fetch);
    await expect(anthropicCompletion(env, model, messages)).resolves.toMatchObject({ content: "{}" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("records the estimate first, settles to the actual charge, and takes back a refusal that generated nothing", async () => {
    const recorded: number[] = [];
    const spend = { estimate: 0.05, record: async (usd: number) => void recorded.push(usd) };
    vi.stubGlobal("fetch", vi.fn(async () => reply("{}")));
    await anthropicCompletion(env, model, messages, spend);
    expect(recorded[0]).toBe(0.05);
    expect(recorded.reduce((a, b) => a + b, 0)).toBeCloseTo(0.02, 6);

    recorded.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => apiError(400, "invalid_request_error", "bad")));
    await expect(anthropicCompletion(env, model, messages, spend)).rejects.toThrow("bad");
    expect(recorded.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);

    recorded.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => apiError(500, "api_error", "boom")));
    await expect(anthropicCompletion(env, model, messages, spend)).rejects.toThrow();
    // Both 5xx attempts keep their estimate: the provider may have billed them.
    expect(recorded.reduce((a, b) => a + b, 0)).toBeCloseTo(0.1, 6);
  });
});
