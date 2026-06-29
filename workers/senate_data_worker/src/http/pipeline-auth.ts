import type { Env } from "../config";

/**
 * Version preview URLs use `<prefix>-congress-tracker-api.<account>.workers.dev`.
 * Production is `congress-tracker-api.<account>.workers.dev` (no extra prefix).
 */
export function isPreviewWorkerHost(hostname: string): boolean {
  return hostname.includes("-congress-tracker-api.");
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  if (typeof crypto.subtle?.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(aBytes, bBytes);
  }
  let mismatch = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    mismatch |= aBytes[i]! ^ bBytes[i]!;
  }
  return mismatch === 0;
}

export function authorizePipeline(request: Request, env: Env): boolean {
  const hostname = new URL(request.url).hostname;
  if (isPreviewWorkerHost(hostname) && env.DEV_OPEN_PIPELINE?.trim() !== "1") {
    return false;
  }

  const token = env.PIPELINE_ADMIN_TOKEN?.trim();
  if (token) {
    const auth = request.headers.get("Authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!bearer) return false;
    return timingSafeEqual(bearer, token);
  }
  // No admin token configured: only allow write pipelines when explicitly opted
  // in for local dev (DEV_OPEN_PIPELINE=1). Never infer dev mode from CORS origin.
  return env.DEV_OPEN_PIPELINE?.trim() === "1";
}
