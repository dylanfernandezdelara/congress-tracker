import type { Env } from "../config";

/**
 * Version preview URLs use `<prefix>-congress-tracker-api.<account>.workers.dev`.
 * Production is `congress-tracker-api.<account>.workers.dev` (no extra prefix).
 */
export function isPreviewWorkerHost(hostname: string): boolean {
  return hostname.includes("-congress-tracker-api.");
}

/** Custom domains + bare production workers.dev hostname. */
export function isProductionPipelineHost(hostname: string): boolean {
  if (hostname === "trackcongress.org" || hostname === "www.trackcongress.org") {
    return true;
  }
  return /^congress-tracker-api\.[^.]+\.workers\.dev$/i.test(hostname);
}

/**
 * Constant-time string compare that does not short-circuit on length.
 * Pads both sides so length differences cannot be timed out byte-by-byte.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.byteLength, bBytes.byteLength, 1);
  const aPad = new Uint8Array(len);
  const bPad = new Uint8Array(len);
  aPad.set(aBytes);
  bPad.set(bBytes);
  let mismatch = aBytes.byteLength ^ bBytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    mismatch |= aPad[i]! ^ bPad[i]!;
  }
  if (typeof crypto.subtle?.timingSafeEqual === "function" && aPad.byteLength === bPad.byteLength) {
    // Prefer platform primitive when available (still combine with length check above).
    const platform = crypto.subtle.timingSafeEqual(aPad, bPad);
    return platform && mismatch === 0;
  }
  return mismatch === 0;
}

/**
 * Authorize admin pipeline writes.
 *
 * - Preview hosts: always denied (isolated D1; no prod remediation via preview).
 * - When `PIPELINE_ADMIN_TOKEN` is set: require matching Bearer token.
 * - When unset: only `DEV_OPEN_PIPELINE=1` on non-production hosts (local/tests).
 *   Production hosts never open without a token — even if the flag leaks into vars.
 */
export function authorizePipeline(request: Request, env: Env): boolean {
  const hostname = new URL(request.url).hostname;
  if (isPreviewWorkerHost(hostname)) {
    return false;
  }

  const token = env.PIPELINE_ADMIN_TOKEN?.trim();
  if (token) {
    const auth = request.headers.get("Authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!bearer) return false;
    return timingSafeEqual(bearer, token);
  }

  if (isProductionPipelineHost(hostname)) {
    return false;
  }

  // Local / test hosts only: never infer open mode from CORS origin.
  return env.DEV_OPEN_PIPELINE?.trim() === "1";
}
