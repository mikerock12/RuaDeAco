import {
  issueSessionToken,
  issueSocketTicket,
  readBearerToken,
  verifySessionToken,
  verifySocketTicket
} from "./auth";
import {
  getRuntimeConfig,
  PROTOCOL_VERSION,
  WORKER_VERSION,
  type Env
} from "./config";
import {
  apiErrorResponse,
  ApiError,
  assertAllowedOrigin,
  corsHeaders,
  jsonResponse
} from "./errors";
import { GameRoom } from "./game-room";
import { createRoomCode, normalizeRoomCode } from "./room-code";
import type {
  InternalAdmissionRequest,
  IssuedAdmission
} from "./types";
import { hasExactKeys, readJsonBody } from "./validation";

export { GameRoom };

const SOCKET_PROTOCOL = "rua-de-aco.v1";
const TICKET_PROTOCOL_PREFIX = "ticket.";
const ROOM_PATH =
  /^\/v1\/rooms\/([^/]+)\/(join|reconnect|ws)$/u;
const sessionBuckets = new Map<
  string,
  { windowStartedAt: number; count: number }
>();

const jsonOk = (
  status: number,
  data: unknown,
  origin: string | null
): Response => jsonResponse(status, { ok: true, data }, origin);

const validateEmptyPostBody = async (request: Request): Promise<void> => {
  if (
    request.body === null ||
    request.headers.get("Content-Length") === "0"
  ) {
    return;
  }
  if (!request.headers.has("Content-Type")) {
    const text = await request.text();
    if (text.length === 0) return;
    throw new ApiError(
      415,
      "unsupported_media_type",
      "Content-Type deve ser application/json."
    );
  }
  const body = await readJsonBody(request);
  if (!hasExactKeys(body, [])) {
    throw new ApiError(
      400,
      "invalid_request",
      "Este endpoint aceita somente um objeto vazio."
    );
  }
};

const getStub = (
  env: Env,
  roomCode: string
): DurableObjectStub<GameRoom> => {
  const id = env.MATCH_ROOMS.idFromName(`room:${roomCode}`);
  return env.MATCH_ROOMS.get(id, { locationHint: "sam" });
};

const readInternalJson = async <T>(response: Response): Promise<T> => {
  const body = (await response.json()) as {
    ok?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || body.ok !== true || body.data === undefined) {
    throw new ApiError(
      response.status,
      body.error?.code ?? "room_request_failed",
      body.error?.message ?? "Falha ao processar a sala."
    );
  }
  return body.data;
};

const admissionRequest = (
  sessionId: string,
  env: Env
): InternalAdmissionRequest => {
  const config = getRuntimeConfig(env);
  return {
    sessionId,
    now: Date.now(),
    ticketTtlMs: config.socketTicketTtlMs,
    roomTtlMs: config.roomTtlMs,
    emptyRoomTtlMs: config.emptyRoomTtlMs,
    reconnectGraceMs: config.reconnectGraceMs
  };
};

const callAdmission = async (
  env: Env,
  roomCode: string,
  operation: "create" | "join" | "reconnect",
  sessionId: string
): Promise<IssuedAdmission> => {
  const response = await getStub(env, roomCode).fetch(
    new Request(`https://room.internal/internal/${operation}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Rua-Internal": env.TICKET_SECRET,
        "X-Room-Code": roomCode
      },
      body: JSON.stringify(admissionRequest(sessionId, env))
    })
  );
  return readInternalJson<IssuedAdmission>(response);
};

const websocketUrl = (request: Request, roomCode: string): string => {
  const url = new URL(request.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/v1/rooms/${roomCode}/ws`;
  url.search = "";
  return url.toString();
};

const createAdmissionPayload = async (
  request: Request,
  env: Env,
  admission: IssuedAdmission,
  sessionId: string
): Promise<Record<string, unknown>> => {
  const ticket = await issueSocketTicket(
    env.TICKET_SECRET,
    sessionId,
    admission.roomCode,
    admission.slot,
    admission.nonce,
    Date.now(),
    admission.nonceExpiresAt
  );
  return {
    roomCode: admission.roomCode,
    slot: admission.slot,
    socketTicket: ticket,
    socketTicketExpiresAt: admission.nonceExpiresAt,
    websocketUrl: websocketUrl(request, admission.roomCode),
    websocketProtocols: [SOCKET_PROTOCOL, `${TICKET_PROTOCOL_PREFIX}${ticket}`]
  };
};

const authenticatedSessionId = async (
  request: Request,
  env: Env
): Promise<string> => {
  const token = readBearerToken(request);
  return (await verifySessionToken(token, env.TICKET_SECRET)).sid;
};

const parseSocketProtocols = (
  request: Request
): { ticket: string; responseProtocol: string } => {
  const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
    .split(",")
    .map((protocol) => protocol.trim())
    .filter(Boolean);
  if (!protocols.includes(SOCKET_PROTOCOL)) {
    throw new ApiError(
      400,
      "protocol_required",
      `Subprotocolo ${SOCKET_PROTOCOL} obrigatório.`
    );
  }
  const ticketProtocols = protocols.filter((protocol) =>
    protocol.startsWith(TICKET_PROTOCOL_PREFIX)
  );
  if (ticketProtocols.length !== 1) {
    throw new ApiError(
      401,
      "socket_ticket_required",
      "Ticket de socket obrigatório."
    );
  }
  const ticketProtocol = ticketProtocols[0];
  if (ticketProtocol === undefined) {
    throw new ApiError(
      401,
      "socket_ticket_required",
      "Ticket de socket obrigatório."
    );
  }
  return {
    ticket: ticketProtocol.slice(TICKET_PROTOCOL_PREFIX.length),
    responseProtocol: SOCKET_PROTOCOL
  };
};

const proxyWebSocket = async (
  request: Request,
  env: Env,
  roomCode: string
): Promise<Response> => {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    throw new ApiError(426, "upgrade_required", "Upgrade WebSocket obrigatório.");
  }
  const { ticket, responseProtocol } = parseSocketProtocols(request);
  const claims = await verifySocketTicket(ticket, env.TICKET_SECRET);
  if (claims.room !== roomCode) {
    throw new ApiError(
      401,
      "ticket_room_mismatch",
      "Ticket não pertence a esta sala."
    );
  }

  const headers = new Headers({
    Upgrade: "websocket",
    "Sec-WebSocket-Protocol": responseProtocol,
    "X-Rua-Internal": env.TICKET_SECRET,
    "X-Room-Code": roomCode,
    "X-Session-Id": claims.sid,
    "X-Player-Slot": claims.slot,
    "X-Ticket-Nonce": claims.nonce,
    "X-Ticket-Expires-At": claims.exp.toString()
  });
  const response = await getStub(env, roomCode).fetch(
    new Request("https://room.internal/internal/ws", { headers })
  );
  if (response.status !== 101) {
    await readInternalJson<never>(response);
    throw new ApiError(500, "internal_error", "Falha ao abrir socket.");
  }
  return response;
};

const checkSessionRate = (request: Request, now: number): void => {
  if (sessionBuckets.size > 10_000) {
    for (const [candidate, value] of sessionBuckets) {
      if (now - value.windowStartedAt >= 60_000) {
        sessionBuckets.delete(candidate);
      }
    }
  }
  const key = `${request.headers.get("CF-Connecting-IP") ?? "local"}:${
    request.headers.get("Origin") ?? "none"
  }`;
  const bucket = sessionBuckets.get(key);
  if (bucket === undefined || now - bucket.windowStartedAt >= 60_000) {
    sessionBuckets.set(key, { windowStartedAt: now, count: 1 });
    return;
  }
  if (bucket.count >= 30) {
    throw new ApiError(
      429,
      "rate_limited",
      "Limite de criação de sessões excedido."
    );
  }
  bucket.count += 1;
};

const createRoom = async (
  request: Request,
  env: Env,
  sessionId: string
): Promise<Record<string, unknown>> => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const roomCode = createRoomCode();
    try {
      const admission = await callAdmission(
        env,
        roomCode,
        "create",
        sessionId
      );
      return createAdmissionPayload(request, env, admission, sessionId);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "room_exists") {
        throw error;
      }
    }
  }
  throw new ApiError(
    503,
    "room_code_exhausted",
    "Não foi possível reservar um código de sala."
  );
};

const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    const origin = assertAllowedOrigin(request, false);
    return jsonOk(
      200,
      {
        service: "rua-de-aco-server",
        status: "ok",
        workerVersion: WORKER_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        serverTime: Date.now()
      },
      origin
    );
  }

  const origin = assertAllowedOrigin(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method === "GET" && path === "/v1/ping") {
    return jsonOk(
      200,
      {
        pong: true,
        protocolVersion: PROTOCOL_VERSION,
        serverTime: Date.now(),
        colo:
          typeof request.cf?.colo === "string" ? request.cf.colo : null
      },
      origin
    );
  }

  if (request.method === "POST" && path === "/v1/sessions") {
    await validateEmptyPostBody(request);
    const now = Date.now();
    checkSessionRate(request, now);
    const issued = await issueSessionToken(
      env.TICKET_SECRET,
      now,
      getRuntimeConfig(env).sessionTtlMs
    );
    return jsonOk(
      201,
      {
        sessionToken: issued.token,
        sessionId: issued.claims.sid,
        expiresAt: issued.claims.exp,
        protocolVersion: PROTOCOL_VERSION
      },
      origin
    );
  }

  if (request.method === "POST" && path === "/v1/rooms") {
    await validateEmptyPostBody(request);
    const sessionId = await authenticatedSessionId(request, env);
    return jsonOk(201, await createRoom(request, env, sessionId), origin);
  }

  const roomMatch = ROOM_PATH.exec(path);
  if (roomMatch !== null) {
    const roomCodeValue = roomMatch[1];
    const operation = roomMatch[2];
    if (roomCodeValue === undefined || operation === undefined) {
      throw new ApiError(404, "not_found", "Rota não encontrada.");
    }
    const roomCode = normalizeRoomCode(roomCodeValue);

    if (request.method === "GET" && operation === "ws") {
      return proxyWebSocket(request, env, roomCode);
    }

    if (
      request.method === "POST" &&
      (operation === "join" || operation === "reconnect")
    ) {
      await validateEmptyPostBody(request);
      const sessionId = await authenticatedSessionId(request, env);
      const admission = await callAdmission(
        env,
        roomCode,
        operation,
        sessionId
      );
      return jsonOk(
        200,
        await createAdmissionPayload(request, env, admission, sessionId),
        origin
      );
    }
  }

  const knownPath =
    path === "/health" ||
    path === "/v1/ping" ||
    path === "/v1/sessions" ||
    path === "/v1/rooms" ||
    roomMatch !== null;
  if (knownPath) {
    throw new ApiError(405, "method_not_allowed", "Método não permitido.");
  }

  throw new ApiError(404, "not_found", "Rota não encontrada.");
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return apiErrorResponse(error, origin);
    }
  }
} satisfies ExportedHandler<Env>;
