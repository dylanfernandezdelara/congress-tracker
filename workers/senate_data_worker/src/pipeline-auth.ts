import { isHarnessFixtureEnv } from "./harness";
import type { JsonResponseBuilder } from "./http/responses";
import type { PipelineEnv } from "./pipeline-env";

export const LOCAL_PIPELINE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export const TOKEN_ENCODER = new TextEncoder();

export function isLocalRequest(request: Request): boolean {
  return LOCAL_PIPELINE_HOSTS.has(new URL(request.url).hostname);
}

export function readPipelineAdminToken(request: Request): string {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]?.trim()) return bearerMatch[1].trim();
  return request.headers.get("X-Pipeline-Admin-Token")?.trim() ?? "";
}

export async function tokenMatches(provided: string, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", TOKEN_ENCODER.encode(provided)),
    crypto.subtle.digest("SHA-256", TOKEN_ENCODER.encode(expected)),
  ]);
  const timingSafeEqual = (crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean;
  }).timingSafeEqual;
  if (timingSafeEqual) return timingSafeEqual(providedHash, expectedHash);

  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let diff = providedBytes.length ^ expectedBytes.length;
  for (let i = 0; i < Math.max(providedBytes.length, expectedBytes.length); i += 1) {
    diff |= (providedBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function authorizePipelineAdmin(
  request: Request,
  env: PipelineEnv,
  jsonResponse: JsonResponseBuilder
): Promise<Response | null> {
  if (isLocalRequest(request) || isHarnessFixtureEnv(env)) return null;

  const expectedToken = env.PIPELINE_ADMIN_TOKEN?.trim();
  if (!expectedToken) {
    return jsonResponse(
      {
        error: "pipeline_admin_token_required",
        message: "Set PIPELINE_ADMIN_TOKEN before exposing manual pipeline run endpoints.",
      },
      { status: 503 }
    );
  }

  const providedToken = readPipelineAdminToken(request);
  if (!providedToken || !(await tokenMatches(providedToken, expectedToken))) {
    return jsonResponse(
      {
        error: "unauthorized",
        message: "Provide a valid pipeline admin token.",
      },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  return null;
}
