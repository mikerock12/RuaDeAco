export const PROTOCOL_VERSION = 1 as const;
export const WORKER_VERSION = "0.1.0";

export const ALLOWED_ORIGINS = new Set([
  "https://mikerock12.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://localhost",
  "capacitor://localhost"
]);

export const ALLOWED_FIGHTERS = new Set([
  "rafa-mare",
  "guto-barba",
  "astro-riso",
  "dante-sinal",
  "leo-violeta",
  "noir-reflexo"
]);

export const ALLOWED_ARENAS = new Set(["cais-da-cidade"]);

export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_WEBSOCKET_MESSAGE_BYTES = 16 * 1024;
export const MAX_INPUT_FRAMES_PER_BATCH = 3;
export const MAX_FUTURE_INPUT_FRAMES = 180;
export const MAX_HASH_FUTURE_FRAMES = 600;
export const RATE_LIMIT_WINDOW_MS = 10_000;
export const RATE_LIMIT_MESSAGES_PER_WINDOW = 300;
export const ROOM_CODE_LENGTH = 10;

export interface Env {
  MATCH_ROOMS: DurableObjectNamespace<import("./game-room").GameRoom>;
  TICKET_SECRET: string;
  SESSION_TTL_SECONDS?: string;
  SOCKET_TICKET_TTL_SECONDS?: string;
  ROOM_TTL_SECONDS?: string;
  EMPTY_ROOM_TTL_SECONDS?: string;
  RECONNECT_GRACE_SECONDS?: string;
  INPUT_DELAY_FRAMES?: string;
}

export interface RuntimeConfig {
  sessionTtlMs: number;
  socketTicketTtlMs: number;
  roomTtlMs: number;
  emptyRoomTtlMs: number;
  reconnectGraceMs: number;
  inputDelayFrames: number;
}

const seconds = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number => {
  if (value === undefined) return fallback * 1000;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return fallback * 1000;
  }
  return parsed * 1000;
};

export const getRuntimeConfig = (env: Env): RuntimeConfig => ({
  sessionTtlMs: seconds(env.SESSION_TTL_SECONDS, 21_600, 60, 86_400),
  socketTicketTtlMs: seconds(
    env.SOCKET_TICKET_TTL_SECONDS,
    45,
    10,
    120
  ),
  roomTtlMs: seconds(env.ROOM_TTL_SECONDS, 7_200, 300, 86_400),
  emptyRoomTtlMs: seconds(env.EMPTY_ROOM_TTL_SECONDS, 600, 60, 3_600),
  reconnectGraceMs: seconds(env.RECONNECT_GRACE_SECONDS, 30, 5, 300),
  inputDelayFrames: integer(env.INPUT_DELAY_FRAMES, 8, 2, 12)
});

const integer = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
};
