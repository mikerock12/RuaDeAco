import { MAX_BODY_BYTES } from "./config";
import { ApiError } from "./errors";

export const isPlainRecord = (
  value: unknown
): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): boolean => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

export const requireString = (
  value: unknown,
  field: string,
  minimum = 1,
  maximum = 128
): string => {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      `Campo ${field} inválido.`
    );
  }
  return value;
};

export const readJsonBody = async (
  request: Request
): Promise<Record<string, unknown>> => {
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength !== null &&
    Number.parseInt(declaredLength, 10) > MAX_BODY_BYTES
  ) {
    throw new ApiError(413, "payload_too_large", "Corpo excede 16 KiB.");
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "Content-Type deve ser application/json."
    );
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiError(413, "payload_too_large", "Corpo excede 16 KiB.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "JSON inválido.");
  }
  if (!isPlainRecord(parsed)) {
    throw new ApiError(400, "invalid_request", "Objeto JSON obrigatório.");
  }
  return parsed;
};
