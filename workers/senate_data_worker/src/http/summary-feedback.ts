import { parseBillQueryParam } from "../../../../shared/bill-id";
import type { Env } from "../config";
import { getDigest, storedGenerator } from "../d1/digests";
import { overDailyLimit, recordSummaryFeedback, type SummaryFeedbackKind } from "../d1/summary-feedback";
import { parseAllowedOrigins } from "./responses";

type JsonFn = (body: unknown, init?: ResponseInit) => Response;

const KINDS: readonly SummaryFeedbackKind[] = ["helpful", "unhelpful", "mistake"];
const NOTE_MAX_CHARS = 500;
const BODY_MAX_BYTES = 4_096;

/** IPv6 clients rotate addresses inside their /64, so the /64 is the reader; IPv4 is used whole. */
function readerAddress(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
}

/**
 * Keyed per-day hash of the reader's address, for rate limits only. The key (FEEDBACK_HASH_SECRET) keeps a copy of
 * the table from being reversed by trying every IPv4 address; hashes from earlier days are erased on each write.
 */
async function clientHash(request: Request, env: Env, day: string): Promise<string> {
  const secret = env.FEEDBACK_HASH_SECRET?.trim() || "trackcongress-feedback";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${day}|${readerAddress(request)}`));
  return [...new Uint8Array(mac).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
  // Refuse large bodies before reading them.
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > BODY_MAX_BYTES) return json({ error: "too_large" }, { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > BODY_MAX_BYTES) return json({ error: "too_large" }, { status: 413 });
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

  const hash = await clientHash(request, env, now.toISOString().slice(0, 10));
  // A reader already over the limit costs no digest lookup.
  if (await overDailyLimit(env.DB, hash, now.toISOString())) return json({ error: "rate_limited" }, { status: 429 });

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
      clientHash: hash,
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
