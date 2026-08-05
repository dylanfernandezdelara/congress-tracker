import { truncateAtSentenceBoundary } from "../../../../shared/feed-content";
import type { Env } from "../config";
import { extractTrailingJsonObject } from "./confirmation-rewrite";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const MAX_TOKENS = 512;
/** Reasoning fallback needs room for chain-of-thought plus the JSON answer. */
const REASONING_FALLBACK_MAX_TOKENS = 4096;
/** Two short sentences of grounded context. */
const VOTE_CONTEXT_MAX_CHARS = 360;

/** Paragraphs about the nomination fight, hearings, or the vote itself. */
const CONTEXT_PARAGRAPH_CUE =
  /\b(?:nominat|confirm|senate|hearing|vote|oppos|controvers|criticiz|testif|committee)/i;

const SOURCE_MAX_CHARS = 4000;

/**
 * Confirmation-relevant paragraphs from the nominee's Wikipedia article.
 * Returns null when the article says nothing about the nomination or vote —
 * there is nothing to ground a "why contested" summary on.
 */
export function selectVoteContextSource(articleText: string): string | null {
  const paragraphs = articleText
    .split(/\n+/)
    .map((p) => p.trim())
    // Drop section headings ("== Career ==") and stub lines.
    .filter((p) => p.length >= 60 && !/^=+.*=+$/.test(p));

  const relevant = paragraphs.filter((p) => CONTEXT_PARAGRAPH_CUE.test(p));
  if (relevant.length === 0) return null;

  let out = "";
  for (const paragraph of relevant) {
    if (out.length + paragraph.length + 2 > SOURCE_MAX_CHARS) break;
    out += (out ? "\n\n" : "") + paragraph;
  }
  return out || null;
}

export function buildVoteContextPrompt(params: {
  nomineeName: string;
  positionTitle: string | null;
  sourceText: string;
}): string {
  return `You summarize why a U.S. Senate confirmation vote was contested, for everyday readers.

NOMINEE: ${params.nomineeName}
CONFIRMED AS: ${params.positionTitle ?? "N/A"}

SOURCE TEXT (from the nominee's Wikipedia article):
${params.sourceText}

Return ONLY valid JSON:
{
  "vote_context": "1-2 short sentences (max 50 words) explaining, per the source text, why the nomination was contested or drew scrutiny — controversies, concerns raised by senators, or positions the nominee took at the confirmation hearing. Empty string if the source text does not say."
}

Rules:
- Use ONLY facts stated in the source text. Never invent reasons, motives, or controversies.
- Do not restate the vote tally, the confirmation itself, or the person's job history — only why the vote was contested or what drew scrutiny.
- General biography or career praise is not vote context. If the source text gives no controversy, criticism, senator concerns, or hearing positions, return {"vote_context": ""}.
- Keep language neutral and concise (grade 7-8). No editorializing.`;
}

export function parseVoteContextJson(text: string): string | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();

  const candidates = [raw];
  const trailing = extractTrailingJsonObject(raw);
  if (trailing && trailing !== raw) candidates.push(trailing);

  for (const candidate of candidates) {
    let parsed: { vote_context?: unknown };
    try {
      parsed = JSON.parse(candidate) as { vote_context?: unknown };
    } catch {
      continue;
    }
    if (typeof parsed.vote_context !== "string") continue;
    const trimmed = parsed.vote_context.trim();
    return trimmed ? truncateAtSentenceBoundary(trimmed, VOTE_CONTEXT_MAX_CHARS) : "";
  }
  return null;
}

async function requestVoteContextCompletion(
  env: Env,
  model: string,
  prompt: string,
  options: { maxTokens: number; disableReasoning: boolean }
): Promise<string | null> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: options.maxTokens,
  };
  if (options.disableReasoning) {
    body.reasoning = { enabled: false };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://congress-tracker.local",
      "X-Title": "Congress Tracker",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseVoteContextJson(content);
}

export type VoteContextResult =
  | { status: "ok"; text: string | null }
  | { status: "unavailable" };

/**
 * Grounded "why the vote was contested" rewrite from Wikipedia source text.
 * Mirrors the confirmation-rewrite two-attempt loop: reasoning disabled
 * first, then a large-budget reasoning fallback.
 * - ok/text: grounded summary to store
 * - ok/null: model found nothing grounded (safe to seal)
 * - unavailable: request/parse failure (do not seal; retry next run)
 */
export async function rewriteVoteContext(
  env: Env,
  params: {
    nomineeName: string;
    positionTitle: string | null;
    sourceText: string;
  },
  model: string
): Promise<VoteContextResult> {
  const prompt = buildVoteContextPrompt(params);

  const attempts = [
    { maxTokens: MAX_TOKENS, disableReasoning: true },
    { maxTokens: REASONING_FALLBACK_MAX_TOKENS, disableReasoning: false },
  ];
  for (const attempt of attempts) {
    const parsed = await requestVoteContextCompletion(env, model, prompt, attempt);
    if (parsed !== null) {
      return { status: "ok", text: parsed || null };
    }
  }
  return { status: "unavailable" };
}
