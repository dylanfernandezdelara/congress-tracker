import { parseBillQueryParam } from "../../../../shared/bill-id";
import type { Env } from "../config";
import { getDigest, storedGenerator } from "../d1/digests";
import { recordSummaryFeedback, type SummaryFeedbackKind } from "../d1/summary-feedback";
import { parseAllowedOrigins } from "./responses";

type JsonFn = (body: unknown, init?: ResponseInit) => Response;

const KINDS: readonly SummaryFeedbackKind[] = ["helpful", "unhelpful", "mistake"];
const NOTE_MAX_CHARS = 500;
const BODY_MAX_BYTES = 4_096;

/** Per-day hash of the reader's IP: enough to rate-limit, never stored raw, unlinkable across days. */
async function clientHash(request: Request, day: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`trackcongress-feedback|${day}|${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * POST /feedback/summary  {"bill":"119-hr-1","kind":"helpful"|"unhelpful"|"mistake","note"?:string}
 * Public, from the site only: when ALLOWED_ORIGIN is set, a request from another origin is refused.
 */
export async function handleSummaryFeedback(request: Request, env: Env, json: JsonFn, now = new Date()): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGIN);
  const origin = request.headers.get("Origin");
  if (Array.isArray(allowed) && allowed.length > 0 && (!origin || !allowed.includes(origin))) {
    return json({ error: "forbidden_origin" }, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > BODY_MAX_BYTES) return json({ error: "too_large" }, { status: 413 });
  let body: { bill?: unknown; kind?: unknown; note?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }
  const ref = typeof body.bill === "string" ? parseBillQueryParam(body.bill) : null;
  const kind = KINDS.find((k) => k === body.kind);
  if (!ref || !kind) return json({ error: "invalid_request", message: "Need bill (e.g. 119-hr-1) and kind" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, NOTE_MAX_CHARS) || null : null;

  const row = await getDigest(env.DB, ref.congress, ref.type, ref.number);
  if (!row?.digest_json) return json({ error: "not_found", message: "No summary for this bill" }, { status: 404 });
  const generator = storedGenerator(row.digest_json);
  let headline: string | null = null;
  try {
    headline = (JSON.parse(row.digest_json) as { headline?: string }).headline ?? null;
  } catch {
    headline = null;
  }
  const result = await recordSummaryFeedback(
    env.DB,
    {
      ref: { congress: ref.congress, type: ref.type, number: ref.number },
      kind,
      note: kind === "mistake" ? note : null,
      clientHash: await clientHash(request, now.toISOString().slice(0, 10)),
      summary: {
        headline,
        model: generator?.model ?? null,
        promptVersion: generator?.prompt_version ?? null,
        fingerprint: generator?.fingerprint ?? null,
      },
    },
    now.toISOString()
  );
  if (result === "rate_limited") return json({ error: "rate_limited" }, { status: 429 });
  return json({ ok: true });
}
