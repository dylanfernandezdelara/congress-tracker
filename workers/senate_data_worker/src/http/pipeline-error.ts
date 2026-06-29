const MAX_PUBLIC_ERROR_LENGTH = 200;

function redactUrlInText(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/** Strip secrets and long upstream detail before echoing pipeline errors publicly. */
export function sanitizePipelineErrorPublic(error: string): string {
  let sanitized = error
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrlInText(match))
    .replace(/api_key=[^\s&"'<>]+/gi, "api_key=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (sanitized.length > MAX_PUBLIC_ERROR_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_PUBLIC_ERROR_LENGTH - 3)}...`;
  }

  return sanitized || "pipeline_error";
}
