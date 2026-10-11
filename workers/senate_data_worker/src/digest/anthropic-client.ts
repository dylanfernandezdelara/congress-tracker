import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../config";
import type { DigestModel } from "./models";
import { AccountError, PermanentError, REFUSED_UNBILLED, type ChatResult, type SpendHook } from "./openrouter-client";
import type { DigestMessages } from "./prompt";

const CALL_TIMEOUT_MS = 180_000;

/**
 * One completion on the Anthropic API, for a model with `provider: "anthropic"`. Same contract as OpenRouter's
 * `chatCompletion`: network errors, timeouts, 429 and 5xx are retried once (the SDK's own retries are off so each
 * attempt is recorded), other 4xx are not; 401/402/403 are account errors. Spend is recorded the same way: an estimate
 * before each attempt, settled to the actual charge (usage × the model's price) when a reply arrives, and taken back
 * only for a refusal that generated nothing. A safety refusal or a reply cut off at max_tokens returns content null,
 * so the writer treats it as an empty reply and tries the other model.
 */
export async function anthropicCompletion(env: Env, model: DigestModel, messages: DigestMessages, spend?: SpendHook): Promise<ChatResult> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AccountError("Anthropic account: ANTHROPIC_API_KEY is not set");
  const price = model.price ?? { input: 0, output: 0 };
  // Global fetch looked up per call, so tests can stub it.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: CALL_TIMEOUT_MS, fetch: (url, init) => fetch(url, init) });
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // Outside the try: if the spend cannot be recorded, nothing is sent.
    if (spend) await spend.record(spend.estimate);
    let result: { chat: ChatResult; cost: number };
    try {
      const res = await client.messages.create({
        model: model.id,
        max_tokens: model.maxTokens,
        ...(model.effort ? { output_config: { effort: model.effort } } : {}),
        system: messages.system,
        messages: [{ role: "user", content: messages.user }],
      });
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const finished = res.stop_reason !== "refusal" && res.stop_reason !== "max_tokens";
      const promptTokens = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
      const completionTokens = res.usage.output_tokens;
      const cost = (promptTokens * price.input + completionTokens * price.output) / 1e6;
      result = {
        chat: { content: finished && text ? text : null, usage: { cost, promptTokens, completionTokens }, generationId: res.id, gatewayLogId: null },
        cost,
      };
    } catch (err: unknown) {
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      if (spend && status !== undefined && REFUSED_UNBILLED.has(status)) await spend.record(-spend.estimate);
      const text = err instanceof Error ? err.message : String(err);
      if (status === undefined || status === 429 || status >= 500) {
        // No reply (timeout, dropped connection) or a retryable refusal: one more try.
        lastError = err;
        continue;
      }
      lastError = [401, 402, 403].includes(status) ? new AccountError(`Anthropic account: ${text}`) : new PermanentError(text);
      break;
    }
    // After the try, so a failure to record can never trigger a second paid request.
    if (spend) await spend.record(result.cost - spend.estimate);
    return result.chat;
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
