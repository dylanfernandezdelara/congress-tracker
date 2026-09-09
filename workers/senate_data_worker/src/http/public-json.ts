import { cacheNoStore } from "./responses";

export type JsonFn = (body: unknown, init?: ResponseInit) => Response;

export const NO_STORE_HEADERS = { "Cache-Control": cacheNoStore };

/**
 * `{ error, message }` envelope shared by the public write endpoints
 * (`/share/quote`, `/chat/bill`). `E` is the endpoint's error-code union.
 */
export function publicErrorResponse<E extends string>(
  json: JsonFn,
  status: number,
  error: E,
  message: string
): Response {
  return json({ error, message }, { status, headers: NO_STORE_HEADERS });
}

/**
 * Parse a JSON body with a byte cap enforced on both the declared and the
 * actual length. Returns null for oversized, non-JSON, or unreadable bodies.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown | null> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Client key for burst/daily limits: Cloudflare's connecting IP, else a shared bucket. */
export function rateLimitKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "anonymous";
}
