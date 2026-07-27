import { PROTOCOL_VERSION } from "./config";
import { ApiError } from "./errors";
import type {
  PlayerSlot,
  SessionClaims,
  SocketTicketClaims
} from "./types";
import { hasExactKeys } from "./validation";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

const base64UrlDecode = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const suffix = "=".repeat((4 - (padded.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded + suffix);
  } catch {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }
  const decoded = Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0)
  );
  if (base64UrlEncode(decoded) !== value) {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }
  return decoded;
};

const importHmacKey = (secret: string): Promise<CryptoKey> => {
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error("TICKET_SECRET deve ter pelo menos 32 bytes.");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

const signPayload = async (
  payload: Record<string, unknown>,
  secret: string
): Promise<string> => {
  const encodedPayload = base64UrlEncode(
    encoder.encode(JSON.stringify(payload))
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    encoder.encode(encodedPayload)
  );
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
};

const verifyPayload = async (
  token: string,
  secret: string
): Promise<Record<string, unknown>> => {
  const parts = token.split(".");
  const encodedPayload = parts[0];
  const encodedSignature = parts[1];
  if (
    parts.length !== 2 ||
    encodedPayload === undefined ||
    encodedSignature === undefined
  ) {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }

  const decodedSignature = base64UrlDecode(encodedSignature);
  const signature = new ArrayBuffer(decodedSignature.byteLength);
  new Uint8Array(signature).set(decodedSignature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    await importHmacKey(secret),
    signature,
    encoder.encode(encodedPayload)
  );
  if (!valid) {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(base64UrlDecode(encodedPayload)));
  } catch {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }
  return parsed as Record<string, unknown>;
};

const isSafeTimestamp = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0;

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  );

export const issueSessionToken = async (
  secret: string,
  now: number,
  ttlMs: number
): Promise<{ token: string; claims: SessionClaims }> => {
  const claims: SessionClaims = {
    t: "session",
    v: PROTOCOL_VERSION,
    sid: crypto.randomUUID(),
    iat: now,
    exp: now + ttlMs
  };
  return {
    token: await signPayload({ ...claims }, secret),
    claims
  };
};

export const verifySessionToken = async (
  token: string,
  secret: string,
  now = Date.now()
): Promise<SessionClaims> => {
  const value = await verifyPayload(token, secret);
  if (
    !hasExactKeys(value, ["t", "v", "sid", "iat", "exp"]) ||
    value.t !== "session" ||
    value.v !== PROTOCOL_VERSION ||
    !isUuid(value.sid) ||
    !isSafeTimestamp(value.iat) ||
    !isSafeTimestamp(value.exp) ||
    value.exp <= value.iat ||
    value.exp - value.iat > 86_400_000 ||
    value.iat > now + 30_000 ||
    value.exp <= now
  ) {
    throw new ApiError(401, "invalid_session", "Sessão inválida ou expirada.");
  }
  return value as unknown as SessionClaims;
};

export const issueSocketTicket = async (
  secret: string,
  sessionId: string,
  roomCode: string,
  slot: PlayerSlot,
  nonce: string,
  now: number,
  expiresAt: number
): Promise<string> => {
  const claims: SocketTicketClaims = {
    t: "socket",
    v: PROTOCOL_VERSION,
    sid: sessionId,
    room: roomCode,
    slot,
    nonce,
    iat: now,
    exp: expiresAt
  };
  return signPayload({ ...claims }, secret);
};

export const verifySocketTicket = async (
  token: string,
  secret: string,
  now = Date.now()
): Promise<SocketTicketClaims> => {
  const value = await verifyPayload(token, secret);
  if (
    !hasExactKeys(value, [
      "t",
      "v",
      "sid",
      "room",
      "slot",
      "nonce",
      "iat",
      "exp"
    ]) ||
    value.t !== "socket" ||
    value.v !== PROTOCOL_VERSION ||
    !isUuid(value.sid) ||
    typeof value.room !== "string" ||
    !/^[A-HJ-NP-Z2-9]{10}$/u.test(value.room) ||
    (value.slot !== "p1" && value.slot !== "p2") ||
    !isUuid(value.nonce) ||
    !isSafeTimestamp(value.iat) ||
    !isSafeTimestamp(value.exp) ||
    value.exp <= value.iat ||
    value.exp - value.iat > 120_000 ||
    value.iat > now + 30_000 ||
    value.exp <= now
  ) {
    throw new ApiError(
      401,
      "invalid_socket_ticket",
      "Ticket de socket inválido ou expirado."
    );
  }
  return value as unknown as SocketTicketClaims;
};

export const readBearerToken = (request: Request): string => {
  const authorization = request.headers.get("Authorization");
  if (authorization === null || !authorization.startsWith("Bearer ")) {
    throw new ApiError(
      401,
      "authorization_required",
      "Bearer token obrigatório."
    );
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (token.length === 0 || token.length > 2_048) {
    throw new ApiError(401, "invalid_token", "Token inválido.");
  }
  return token;
};
