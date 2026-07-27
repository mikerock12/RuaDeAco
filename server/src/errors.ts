import { ALLOWED_ORIGINS } from "./config";

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const corsHeaders = (origin: string | null): Headers => {
  const headers = new Headers({
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Sec-WebSocket-Protocol",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin"
  });

  if (origin !== null && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
};

export const jsonResponse = (
  status: number,
  body: unknown,
  origin: string | null = null
): Response => {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
};

export const apiErrorResponse = (
  error: unknown,
  origin: string | null = null
): Response => {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = {
      ok: false,
      error: { code: error.code, message: error.message }
    };
    return jsonResponse(error.status, body, origin);
  }

  console.error(
    JSON.stringify({
      event: "unhandled_error",
      message: error instanceof Error ? error.message : "unknown"
    })
  );
  return jsonResponse(
    500,
    {
      ok: false,
      error: {
        code: "internal_error",
        message: "Erro interno do servidor."
      }
    } satisfies ApiErrorBody,
    origin
  );
};

export const assertAllowedOrigin = (
  request: Request,
  required = true
): string | null => {
  const origin = request.headers.get("Origin");
  if (origin === null) {
    if (required) {
      throw new ApiError(403, "origin_required", "Origin obrigatório.");
    }
    return null;
  }
  if (!ALLOWED_ORIGINS.has(origin)) {
    throw new ApiError(403, "origin_not_allowed", "Origin não permitido.");
  }
  return origin;
};
