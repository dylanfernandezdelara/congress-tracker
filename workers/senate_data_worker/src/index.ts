interface Env {
  DATA_BUCKET: R2Bucket;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
}

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
  ...corsHeaders
};

const healthCache = "s-maxage=60, max-age=0, must-revalidate";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers ?? {})
    }
  });

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (pathname === "/health") {
      return jsonResponse(
        {
          status: "ok",
          timestamp: new Date().toISOString()
        },
        {
          status: 200,
          headers: { "Cache-Control": healthCache }
        }
      );
    }

    return jsonResponse(
      {
        error: "not_found",
        message: "Resource not found",
        path: pathname
      },
      { status: 404 }
    );
  }
} satisfies ExportedHandler<Env>;

