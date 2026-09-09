export type QuoteStreamEvent =
  | { type: "text"; text: string }
  | { type: "quote"; section: string | null; text: string };

const OPEN = "<quote";
const CLOSE = "</quote>";
export const QUOTE_TAG_MAX_CHARS = 2_000;

function longestSuffixPrefix(value: string, target: string): number {
  const max = Math.min(value.length, target.length - 1);
  for (let n = max; n > 0; n--) {
    if (target.startsWith(value.slice(-n))) return n;
  }
  return 0;
}

function tryConsumeOpenTag(
  value: string
): "incomplete" | "not_tag" | { section: string | null; rest: string } {
  if (!value.startsWith("<")) return "not_tag";
  if (value.length < OPEN.length) {
    return OPEN.startsWith(value) ? "incomplete" : "not_tag";
  }
  if (!value.startsWith(OPEN)) return "not_tag";
  const after = value[OPEN.length];
  if (after === undefined) return "incomplete";
  if (after !== ">" && !/\s/.test(after)) return "not_tag";
  const gt = value.indexOf(">", OPEN.length);
  if (gt === -1) return "incomplete";
  const inside = value.slice(OPEN.length, gt).trim();
  let section: string | null = null;
  if (inside.length > 0) {
    const match = /(?:^|\s)section\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(inside);
    if (match) section = match[1] ?? match[2] ?? null;
  }
  return { section, rest: value.slice(gt + 1) };
}

/**
 * Incremental parser for `<quote section="…">…</quote>` tags embedded in
 * model prose. Holds back a possible partial open/close prefix at the end of
 * each delta so tags never leak as text.
 */
export function createQuoteTagParser(onEvent: (event: QuoteStreamEvent) => void): {
  push: (delta: string) => void;
  flush: () => void;
} {
  let mode: "text" | "quote" = "text";
  let buf = "";
  let quoteSection: string | null = null;
  let quoteBody = "";

  function emitText(text: string): void {
    if (text) onEvent({ type: "text", text });
  }

  function resetQuote(): void {
    quoteSection = null;
    quoteBody = "";
    mode = "text";
  }

  function process(endOfInput: boolean): void {
    while (buf.length > 0) {
      if (mode === "text") {
        const lt = buf.indexOf("<");
        if (lt === -1) {
          emitText(buf);
          buf = "";
          return;
        }
        if (lt > 0) {
          emitText(buf.slice(0, lt));
          buf = buf.slice(lt);
        }
        const parsed = tryConsumeOpenTag(buf);
        if (parsed === "incomplete") {
          if (endOfInput) {
            emitText(buf);
            buf = "";
          }
          return;
        }
        if (parsed === "not_tag") {
          emitText("<");
          buf = buf.slice(1);
          continue;
        }
        quoteSection = parsed.section;
        buf = parsed.rest;
        quoteBody = "";
        mode = "quote";
        continue;
      }

      const closeAt = buf.indexOf(CLOSE);
      if (closeAt !== -1) {
        quoteBody += buf.slice(0, closeAt);
        buf = buf.slice(closeAt + CLOSE.length);
        if (quoteBody.length > QUOTE_TAG_MAX_CHARS) {
          emitText(quoteBody);
        } else {
          onEvent({ type: "quote", section: quoteSection, text: quoteBody });
        }
        resetQuote();
        continue;
      }

      const hold = longestSuffixPrefix(buf, CLOSE);
      const take = buf.slice(0, buf.length - hold);
      buf = buf.slice(buf.length - hold);
      quoteBody += take;
      if (quoteBody.length > QUOTE_TAG_MAX_CHARS) {
        emitText(quoteBody);
        if (buf) emitText(buf);
        buf = "";
        resetQuote();
        return;
      }
      if (endOfInput) {
        emitText(quoteBody + buf);
        buf = "";
        resetQuote();
      }
      return;
    }
  }

  function flushHeld(): void {
    if (mode === "quote") {
      emitText(quoteBody + buf);
      buf = "";
      resetQuote();
      return;
    }
    if (buf) {
      emitText(buf);
      buf = "";
    }
  }

  return {
    push(delta: string): void {
      if (!delta) return;
      buf += delta;
      process(false);
    },
    flush(): void {
      process(true);
      flushHeld();
    },
  };
}
