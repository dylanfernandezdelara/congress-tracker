import {
  convertToModelMessages,
  type LanguageModel,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import {
  BILL_CHAT_MAX_HISTORY_TURNS,
  BILL_CHAT_UNVERIFIED_PLACEHOLDER,
  type BillChatAnswerData,
  type BillChatQuoteData,
} from "../../../../shared/chat-api-types";
import { formatBillQueryParam } from "../../../../shared/bill-id";
import { signAnswer } from "./answer-signature";
import {
  findChunkForQuote,
  type EvidenceChunk,
} from "./bill-chat-evidence";
import { createQuoteTagParser } from "./quote-stream";

export const BILL_CHAT_REFUSAL_PREFIX = "The bill text doesn't address this";

export type BillChatUIMessage = UIMessage<
  unknown,
  { quote: BillChatQuoteData; answer: BillChatAnswerData }
>;

export type BillChatStreamText = (options: {
  model: LanguageModel;
  system: string;
  messages: Awaited<ReturnType<typeof convertToModelMessages>>;
  temperature: number;
  maxOutputTokens: number;
  /**
   * `textStream` never surfaces provider errors (the SDK only reports them
   * here), so the caller records the error and `writeBillChatStream` turns it
   * into an `error` part instead of signing an empty answer.
   */
  onError: (event: { error: unknown }) => void;
  providerOptions?: {
    openrouter: { models: string[]; reasoning?: { effort: "low"; exclude: boolean } };
  };
}) =>
  | { textStream: AsyncIterable<string> }
  | Promise<{ textStream: AsyncIterable<string> }>;

export const BILL_CHAT_ERROR_TEXT = "The chat service failed. Try again shortly.";

export type BillChatStreamWriter = UIMessageStreamWriter<BillChatUIMessage>;

type TextPart = { type: "text"; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function extractTextParts(parts: unknown): TextPart[] {
  if (!Array.isArray(parts)) return [];
  const out: TextPart[] = [];
  for (const part of parts) {
    if (!isRecord(part)) continue;
    if (part.type === "text" && typeof part.text === "string") {
      out.push({ type: "text", text: part.text });
    }
  }
  return out;
}

export function latestUserQuestion(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!isRecord(message) || message.role !== "user") continue;
    const texts = extractTextParts(message.parts);
    if (texts.length === 0) return null;
    const last = texts[texts.length - 1]!.text.trim();
    return last.length > 0 ? last : null;
  }
  return null;
}

export function filterChatHistory(messages: unknown[]): BillChatUIMessage[] {
  const cleaned: BillChatUIMessage[] = [];
  for (const message of messages) {
    if (!isRecord(message)) continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = extractTextParts(message.parts);
    if (parts.length === 0) continue;
    cleaned.push({
      id: typeof message.id === "string" ? message.id : `m${cleaned.length}`,
      role: message.role,
      parts,
    });
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1]!.role !== "user") {
    cleaned.pop();
  }
  let users = 0;
  let start = 0;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    if (cleaned[i]!.role === "user") {
      users += 1;
      if (users >= BILL_CHAT_MAX_HISTORY_TURNS) {
        start = i;
        break;
      }
    }
  }
  return cleaned.slice(start);
}

export function applySelection(
  messages: BillChatUIMessage[],
  selection: string | undefined
): BillChatUIMessage[] {
  if (!selection?.trim()) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      parts: [{ type: "text", text: `Selected passage: ${selection.trim()}` }, ...last.parts],
    },
  ];
}

export function buildBillChatSystemPrompt(params: {
  title: string;
  bill: { congress: number; type: string; number: number };
  chunks: EvidenceChunk[];
}): string {
  const billId = formatBillQueryParam(params.bill);
  const title = params.title || billId;
  const blocks = params.chunks
    .map((chunk) => `### ${chunk.section_label}\n${chunk.text}`)
    .join("\n\n");
  return [
    `You are answering questions about ONE bill: ${title} (${billId}).`,
    "The only evidence you may use is below. Each block starts with a header; copy that header text into quote tags.",
    "",
    blocks || "(no evidence)",
    "",
    "Rules:",
    "- Answer only from the evidence.",
    '- Every factual claim must be supported by at least one verbatim passage written as <quote section="Sec. 3. Definitions">exact text copied character-for-character from that block</quote>. Copy the section label from the block header (the text after ###).',
    "- Passages are 1–3 sentences.",
    `- If the evidence does not address the question, reply exactly with a short refusal beginning "${BILL_CHAT_REFUSAL_PREFIX}" and no quotes.`,
    "- Be concise (no more than 180 words of prose).",
    "- Do not use markdown headings.",
    "- Reply with the final answer only: no planning, reasoning, or notes about these rules.",
  ].join("\n");
}

export async function writeBillChatStream(params: {
  writer: BillChatStreamWriter;
  textStream: AsyncIterable<string>;
  chunks: EvidenceChunk[];
  hmacSecret?: string;
  /** Provider error captured via `streamText`'s `onError`; read after the text stream ends. */
  streamError?: () => unknown;
}): Promise<void> {
  const { writer, chunks, hmacSecret } = params;
  let textOpen = false;
  let textSeq = 0;
  let textId = "text-0";
  let prose = "";
  let unverified = 0;
  let quoteIndex = 0;

  function ensureText(): void {
    if (textOpen) return;
    textId = `text-${textSeq}`;
    textSeq += 1;
    writer.write({ type: "text-start", id: textId });
    textOpen = true;
  }

  function endText(): void {
    if (!textOpen) return;
    writer.write({ type: "text-end", id: textId });
    textOpen = false;
  }

  const parser = createQuoteTagParser((event) => {
    if (event.type === "text") {
      ensureText();
      writer.write({ type: "text-delta", id: textId, delta: event.text });
      prose += event.text;
      return;
    }
    const found = findChunkForQuote(chunks, event.text);
    if (!found) {
      unverified += 1;
      ensureText();
      writer.write({
        type: "text-delta",
        id: textId,
        delta: BILL_CHAT_UNVERIFIED_PLACEHOLDER,
      });
      prose += BILL_CHAT_UNVERIFIED_PLACEHOLDER;
      return;
    }
    endText();
    quoteIndex += 1;
    const sourceId = `${found.chunk.id}-${quoteIndex}`;
    const data: BillChatQuoteData = {
      sourceId,
      text: found.displayText,
      section_label: found.chunk.section_label,
      source: found.chunk.source,
    };
    writer.write({
      type: "source-document",
      sourceId,
      mediaType: "text/plain",
      title: found.chunk.section_label,
    });
    writer.write({ type: "data-quote", id: sourceId, data });
  });

  try {
    for await (const delta of params.textStream) {
      parser.push(delta);
    }
    parser.flush();
  } catch (err: unknown) {
    console.error("bill_chat_llm_error", err);
    endText();
    writer.write({ type: "error", errorText: BILL_CHAT_ERROR_TEXT });
    return;
  }

  endText();
  const text = prose.trim();
  const providerError = params.streamError?.();
  if (providerError !== undefined && providerError !== null) {
    console.error("bill_chat_provider_error", providerError);
    writer.write({ type: "error", errorText: BILL_CHAT_ERROR_TEXT });
    return;
  }
  if (text.length === 0 && quoteIndex === 0) {
    console.error("bill_chat_empty_answer");
    writer.write({ type: "error", errorText: BILL_CHAT_ERROR_TEXT });
    return;
  }
  const sig = hmacSecret ? await signAnswer(hmacSecret, text) : null;
  const answer: BillChatAnswerData = {
    text,
    sig,
    unverified_quotes: unverified,
    refused: text.startsWith(BILL_CHAT_REFUSAL_PREFIX),
  };
  writer.write({ type: "data-answer", data: answer });
}
