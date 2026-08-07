/**
 * Shared helpers for extracting JSON answers from LLM chat content.
 * Reasoning models often prepend chain-of-thought before the JSON object.
 */

/** Prefer fenced ``` / ```json payload when present; otherwise trimmed text. */
export function stripMarkdownFence(text: string): string {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  return raw;
}

/**
 * JSON object at the tail of mixed output. Reasoning models that inline their
 * thinking into `content` end with the JSON answer, so the object must close
 * the message — this rejects schema echoes inside truncated reasoning text.
 * JSON.parse is the oracle; no hand-rolled brace/escape scanning.
 */
export function extractTrailingJsonObject(text: string): string | null {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith("}")) return null;
  for (
    let start = trimmed.indexOf("{");
    start !== -1;
    start = trimmed.indexOf("{", start + 1)
  ) {
    const candidate = trimmed.slice(start);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Not a balanced object from this brace; try the next one.
    }
  }
  return null;
}

/**
 * Candidate JSON payloads to try: the (optionally unfenced) raw string, then a
 * trailing object when reasoning text precedes the answer.
 */
export function jsonParseCandidates(text: string): string[] {
  const raw = stripMarkdownFence(text);
  const candidates = [raw];
  const trailing = extractTrailingJsonObject(raw);
  if (trailing && trailing !== raw) candidates.push(trailing);
  return candidates;
}
