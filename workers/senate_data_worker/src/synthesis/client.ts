import OpenAI from "openai";
import { mapWithConcurrency } from "../concurrency";
import { buildBillKey } from "../congress";
import { readDocumentJson, writeDocumentJson } from "../d1/documents";
import { buildBillNarrativeKey } from "../storage";
import type { AnalyzeBillInput, AnalyzeBillsOptions, AnalyzeBillsResult } from "./types-shared";
import type { BillAnalysis } from "../types";
import { coerceBillAnalysis, ensureClaimsHaveRefs, isAnalysisRefreshNeeded, normalizeModelList } from "./coerce";
import { buildPrompt } from "./prompt";
import { parseModelJson } from "./parse-json";
import {
  claimCoverage,
  benefitMapCoverage,
  likelyReasonCoverage,
  qualityCoverage,
} from "./quality";

export { ANALYSIS_VERSION, DEFAULT_OPENROUTER_MODELS, DEFAULT_OPENROUTER_MODEL } from "./constants";
export type { AnalyzeBillInput, AnalyzeBillsOptions, AnalyzeBillsResult } from "./types-shared";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageContent(message: unknown): string {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") parts.push(p.text);
    }
    return parts.join("\n").trim();
  }
  return "";
}

async function runModelCompletion(
  client: OpenAI,
  models: string[],
  prompt: string,
  timeoutMs: number,
  maxRetries: number
): Promise<string> {
  let lastError: unknown;
  const [primaryModel, ...fallbackModels] = models;
  const buildRequest = (includeResponseFormat: boolean) => {
    const request: Record<string, unknown> = {
      model: primaryModel,
      temperature: 0,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    };
    if (includeResponseFormat) {
      request.response_format = { type: "json_object" };
    }
    if (fallbackModels.length > 0) {
      request.extra_body = { models: fallbackModels };
    }
    return request;
  };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const request = client.chat.completions.create(buildRequest(true) as never);
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`OpenRouter timeout after ${timeoutMs}ms`)), timeoutMs);
      });
      const completion = await Promise.race([request, timeout]);
      const message = completion.choices?.[0]?.message;
      return getMessageContent(message);
    } catch (error) {
      lastError = error;
      try {
        const fallbackRequest = client.chat.completions.create(buildRequest(false) as never);
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`OpenRouter timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        const completion = await Promise.race([fallbackRequest, timeout]);
        const message = completion.choices?.[0]?.message;
        return getMessageContent(message);
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
    if (attempt < maxRetries) {
      await sleep(1_000 * Math.pow(2, attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function analyzeSingleBill(
  client: OpenAI,
  input: AnalyzeBillInput,
  models: string[],
  timeoutMs: number,
  maxRetries: number
): Promise<BillAnalysis> {
  const prompt = buildPrompt(input);
  const parseAttempts = 2;

  const runAndCoerce = async (targetModels: string[]): Promise<BillAnalysis> => {
    let last: BillAnalysis | null = null;
    for (let attempt = 0; attempt < parseAttempts; attempt++) {
      const content = await runModelCompletion(client, targetModels, prompt, timeoutMs, maxRetries);
      const parsed = parseModelJson(content);
      const analysis = coerceBillAnalysis(parsed, input.bill, input.impactEvidence);
      last = analysis;
      if (ensureClaimsHaveRefs(analysis)) return analysis;
    }
    if (last) return last;
    throw new Error("Failed to parse grounded analysis output");
  };

  return runAndCoerce(models);
}

export async function analyzeBillsWithCache(
  db: D1Database,
  inputs: AnalyzeBillInput[],
  options: AnalyzeBillsOptions
): Promise<AnalyzeBillsResult> {
  const requestedByKey = new Map<string, AnalyzeBillInput>();
  for (const input of inputs) {
    const bill = input.bill;
    if (!bill || !bill.congress || !bill.type || !bill.number) continue;
    const key = buildBillKey(bill);
    if (!requestedByKey.has(key)) requestedByKey.set(key, input);
  }

  const analysisByKey = new Map<string, BillAnalysis>();
  let cacheHitCount = 0;
  let analyzedCount = 0;
  let skippedCount = 0;
  let deferredCount = 0;
  let fallbackCount = 0;
  let inputSkipCount = 0;

  const models = normalizeModelList(options.models ?? options.model);
  const maxNewAnalyses = options.maxNewAnalyses ?? 20;
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? 30_000);
  const maxRetries = Math.max(0, options.maxRetries ?? 2);
  const analysisConcurrency = Math.max(1, Math.min(options.analysisConcurrency ?? 2, 3));
  const defaultHeaders: Record<string, string> = {
    "X-Title": options.appTitle ?? "congress_tracker_worker",
  };
  if (options.appReferer?.trim()) {
    defaultHeaders["HTTP-Referer"] = options.appReferer.trim();
  }

  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders,
  });

  const pending: Array<{ key: string; input: AnalyzeBillInput }> = [];
  const entries = Array.from(requestedByKey.entries());
  const cachedChecks = await mapWithConcurrency(entries, 4, async ([key, input]) => {
    const narrativeKey = buildBillNarrativeKey(key);
    const cachedNarrative = await readDocumentJson<BillAnalysis>(db, narrativeKey);
    const cached = cachedNarrative;
    return { key, input, cached };
  });

  for (const item of cachedChecks) {
    const cached = item.cached;
    if (cached && !isAnalysisRefreshNeeded(cached, item.input)) {
      analysisByKey.set(item.key, cached);
      cacheHitCount++;
      continue;
    }
    pending.push({ key: item.key, input: item.input });
  }

  if (pending.length > maxNewAnalyses) {
    deferredCount += pending.length - maxNewAnalyses;
    skippedCount += pending.length - maxNewAnalyses;
  }
  const work = pending.slice(0, maxNewAnalyses);

  const analyzed = await mapWithConcurrency(work, analysisConcurrency, async ({ key, input }) => {
    const bill = input.bill;
    if (!bill.summary && !bill.title) {
      return {
        key,
        analysis: null as BillAnalysis | null,
        skipReason: "input" as const,
      };
    }
    try {
      const analysis = await analyzeSingleBill(
        client,
        input,
        models,
        timeoutMs,
        maxRetries
      );
      return { key, analysis, skipReason: null };
    } catch (error) {
      console.warn(
        `[openrouter] Analysis failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      const fallback = coerceBillAnalysis({}, input.bill, input.impactEvidence);
      return {
        key,
        analysis: fallback,
        skipReason: "fallback" as const,
      };
    }
  });

  for (const result of analyzed) {
    if (!result.analysis) {
      skippedCount++;
      inputSkipCount++;
      continue;
    }
    if (result.skipReason === "fallback") {
      skippedCount++;
      fallbackCount++;
    }
    analyzedCount++;
    analysisByKey.set(result.key, result.analysis);
    await writeDocumentJson(db, buildBillNarrativeKey(result.key), result.analysis);
  }

  const qualityMetrics = qualityCoverage(analysisByKey, requestedByKey);

  return {
    analysisByKey,
    analyzedCount,
    cacheHitCount,
    skippedCount,
    deferredCount,
    fallbackCount,
    inputSkipCount,
    claimsWithEvidenceRefPct: claimCoverage(analysisByKey),
    benefitMapWithEvidenceRefPct: benefitMapCoverage(analysisByKey),
    likelyReasonsWithEvidenceRefPct: likelyReasonCoverage(analysisByKey),
    quoteValidityPct: qualityMetrics.quoteValidityPct,
    confidenceCalibrationMismatchPct: qualityMetrics.confidenceCalibrationMismatchPct,
  };
}
