/** Baseline HTTP hardening — Worker JSON via responses.ts; static assets via web/public/_headers. */

export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

export type SecurityHeaderName = keyof typeof SECURITY_HEADERS;
