import { DurableObject } from "cloudflare:workers";

import {
  ALLOWED_ARENAS,
  ALLOWED_FIGHTERS,
  MAX_FUTURE_INPUT_FRAMES,
  MAX_HASH_FUTURE_FRAMES,
  MAX_INPUT_FRAMES_PER_BATCH,
  MAX_WEBSOCKET_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  RATE_LIMIT_MESSAGES_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  getRuntimeConfig,
  type Env
} from "./config";
import { ApiError, apiErrorResponse, jsonResponse } from "./errors";
import { logRoomEvent } from "./logging";
import type {
  InputFrame,
  InternalAdmissionRequest,
  IssuedAdmission,
  PlayerSlot,
  RoomPhase,
  RoomSnapshot,
  RoomSnapshotPlayer,
  Selection,
  SocketAttachment
} from "./types";
import {
  hasExactKeys,
  isPlainRecord,
  requireString
} from "./validation";

interface RoomRow extends Record<string, SqlStorageValue> {
  schema_version: number;
  protocol_version: number;
  room_code: string;
  phase: RoomPhase;
  seed: number | null;
  start_at: number | null;
  input_delay: number | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
  empty_room_ttl_ms: number;
  reconnect_grace_ms: number;
  empty_deadline: number | null;
  closed_at: number | null;
  close_reason: string | null;
  last_confirmed_frame: number;
}

interface SlotRow extends Record<string, SqlStorageValue> {
  slot: PlayerSlot;
  session_id: string;
  connected: number;
  fighter_id: string | null;
  arena_id: string | null;
  client_build_id: string | null;
  engine_version: string | null;
  asset_revision: string | null;
  ready: number;
  joined_at: number;
  disconnected_at: number | null;
  reconnect_deadline: number | null;
  last_sequence: number;
  last_input_frame: number;
  last_ack_frame: number;
}

interface CountRow extends Record<string, SqlStorageValue> {
  count: number;
}

interface NonceRow extends Record<string, SqlStorageValue> {
  nonce: string;
}

interface HashRow extends Record<string, SqlStorageValue> {
  state_hash: string;
}

interface InputStateRow extends Record<string, SqlStorageValue> {
  last_held_mask: number;
}

const SOCKET_PROTOCOL = "rua-de-aco.v1";
const SLOT_TAG_PREFIX = "slot:";
const INTERNAL_HEADER = "X-Rua-Internal";
const SERVER_FRAME_MS = 1000 / 60;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS room (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL,
    protocol_version INTEGER NOT NULL,
    room_code TEXT NOT NULL UNIQUE,
    phase TEXT NOT NULL CHECK (phase IN ('waiting', 'ready', 'active', 'closed')),
    seed INTEGER,
    start_at INTEGER,
    input_delay INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    empty_room_ttl_ms INTEGER NOT NULL,
    reconnect_grace_ms INTEGER NOT NULL,
    empty_deadline INTEGER,
    closed_at INTEGER,
    close_reason TEXT,
    last_confirmed_frame INTEGER NOT NULL DEFAULT -1
  );

  CREATE TABLE IF NOT EXISTS slots (
    slot TEXT PRIMARY KEY CHECK (slot IN ('p1', 'p2')),
    session_id TEXT NOT NULL UNIQUE,
    connected INTEGER NOT NULL DEFAULT 0,
    fighter_id TEXT,
    arena_id TEXT,
    client_build_id TEXT,
    engine_version TEXT,
    asset_revision TEXT,
    ready INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    disconnected_at INTEGER,
    reconnect_deadline INTEGER,
    last_sequence INTEGER NOT NULL DEFAULT -1,
    last_input_frame INTEGER NOT NULL DEFAULT -1,
    last_ack_frame INTEGER NOT NULL DEFAULT -1
  );

  CREATE TABLE IF NOT EXISTS ticket_nonces (
    nonce TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('p1', 'p2')),
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    invalidated_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS ticket_nonces_expiry
    ON ticket_nonces (expires_at);

  CREATE TABLE IF NOT EXISTS state_hashes (
    frame INTEGER NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('p1', 'p2')),
    state_hash TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (frame, slot)
  );

  CREATE TABLE IF NOT EXISTS desyncs (
    frame INTEGER PRIMARY KEY,
    detected_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_rates (
    session_id TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL,
    request_count INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS active_connections (
    slot TEXT PRIMARY KEY CHECK (slot IN ('p1', 'p2')),
    connection_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    connected_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS input_states (
    slot TEXT PRIMARY KEY CHECK (slot IN ('p1', 'p2')),
    last_held_mask INTEGER NOT NULL DEFAULT 0
      CHECK (last_held_mask BETWEEN 0 AND 255)
  );
`;

const oppositeSlot = (slot: PlayerSlot): PlayerSlot =>
  slot === "p1" ? "p2" : "p1";

const isIntegerBetween = (
  value: unknown,
  minimum: number,
  maximum: number
): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= maximum;

const internalOk = (data: unknown, status = 200): Response =>
  jsonResponse(status, { ok: true, data });

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(SCHEMA);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  private rows<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): T[] {
    return [...this.ctx.storage.sql.exec<T>(query, ...bindings)];
  }

  private first<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): T | undefined {
    return this.rows<T>(query, ...bindings)[0];
  }

  private room(): RoomRow | undefined {
    return this.first<RoomRow>("SELECT * FROM room WHERE id = 1");
  }

  private slots(): SlotRow[] {
    return this.rows<SlotRow>("SELECT * FROM slots ORDER BY slot");
  }

  private slot(slot: PlayerSlot): SlotRow | undefined {
    return this.first<SlotRow>(
      "SELECT * FROM slots WHERE slot = ?",
      slot
    );
  }

  private requireInternal(request: Request): void {
    if (request.headers.get(INTERNAL_HEADER) !== this.env.TICKET_SECRET) {
      throw new ApiError(404, "not_found", "Rota não encontrada.");
    }
  }

  private readRoomCode(request: Request): string {
    const roomCode = request.headers.get("X-Room-Code");
    if (
      roomCode === null ||
      !/^[A-HJ-NP-Z2-9]{10}$/u.test(roomCode)
    ) {
      throw new ApiError(400, "invalid_room_code", "Código de sala inválido.");
    }
    return roomCode;
  }

  private async readAdmission(
    request: Request
  ): Promise<InternalAdmissionRequest> {
    const value = (await request.json()) as unknown;
    if (
      !isPlainRecord(value) ||
      !hasExactKeys(value, [
        "sessionId",
        "now",
        "ticketTtlMs",
        "roomTtlMs",
        "emptyRoomTtlMs",
        "reconnectGraceMs"
      ])
    ) {
      throw new ApiError(400, "invalid_internal_request", "Pedido inválido.");
    }
    const sessionId = requireString(value.sessionId, "sessionId", 36, 36);
    if (
      !isIntegerBetween(value.now, 1, Number.MAX_SAFE_INTEGER) ||
      !isIntegerBetween(value.ticketTtlMs, 10_000, 120_000) ||
      !isIntegerBetween(value.roomTtlMs, 300_000, 86_400_000) ||
      !isIntegerBetween(value.emptyRoomTtlMs, 60_000, 3_600_000) ||
      !isIntegerBetween(value.reconnectGraceMs, 5_000, 300_000)
    ) {
      throw new ApiError(400, "invalid_internal_request", "Pedido inválido.");
    }
    return {
      sessionId,
      now: value.now,
      ticketTtlMs: value.ticketTtlMs,
      roomTtlMs: value.roomTtlMs,
      emptyRoomTtlMs: value.emptyRoomTtlMs,
      reconnectGraceMs: value.reconnectGraceMs
    };
  }

  private issueNonce(
    sessionId: string,
    slot: PlayerSlot,
    now: number,
    ticketTtlMs: number
  ): IssuedAdmission {
    const room = this.room();
    if (room === undefined) {
      throw new ApiError(404, "room_not_found", "Sala não encontrada.");
    }
    const nonce = crypto.randomUUID();
    const nonceExpiresAt = now + ticketTtlMs;
    this.ctx.storage.sql.exec(
      `UPDATE ticket_nonces
       SET invalidated_at = ?
       WHERE session_id = ? AND slot = ? AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      now,
      sessionId,
      slot
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO ticket_nonces
         (nonce, session_id, slot, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      nonce,
      sessionId,
      slot,
      now,
      nonceExpiresAt
    );
    return { roomCode: room.room_code, slot, nonce, nonceExpiresAt };
  }

  private checkAdmissionRate(sessionId: string, now: number): void {
    const rate = this.first<
      Record<string, SqlStorageValue> & {
        window_started_at: number;
        request_count: number;
      }
    >(
      `SELECT window_started_at, request_count
       FROM session_rates WHERE session_id = ?`,
      sessionId
    );
    if (rate === undefined || now - rate.window_started_at >= 10_000) {
      this.ctx.storage.sql.exec(
        `INSERT INTO session_rates
          (session_id, window_started_at, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT (session_id)
         DO UPDATE SET window_started_at = excluded.window_started_at,
                       request_count = 1`,
        sessionId,
        now
      );
      return;
    }
    if (rate.request_count >= 60) {
      throw new ApiError(
        429,
        "rate_limited",
        "Limite de pedidos para a sala excedido."
      );
    }
    this.ctx.storage.sql.exec(
      "UPDATE session_rates SET request_count = request_count + 1 WHERE session_id = ?",
      sessionId
    );
  }

  private ensureOpen(room: RoomRow | undefined, now: number): RoomRow {
    if (room === undefined) {
      throw new ApiError(404, "room_not_found", "Sala não encontrada.");
    }
    if (
      room.phase === "closed" ||
      room.closed_at !== null ||
      room.expires_at <= now
    ) {
      throw new ApiError(410, "room_closed", "Sala encerrada.");
    }
    return room;
  }

  private async create(
    request: Request,
    roomCode: string
  ): Promise<Response> {
    const admission = await this.readAdmission(request);
    this.checkAdmissionRate(admission.sessionId, admission.now);
    const inserted = this.first<CountRow>(
      `INSERT INTO room
        (id, schema_version, protocol_version, room_code, phase,
         input_delay, created_at, updated_at, expires_at,
         empty_room_ttl_ms, reconnect_grace_ms, empty_deadline)
       VALUES (1, 1, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING 1 AS count`,
      PROTOCOL_VERSION,
      roomCode,
      getRuntimeConfig(this.env).inputDelayFrames,
      admission.now,
      admission.now,
      admission.now + admission.roomTtlMs,
      admission.emptyRoomTtlMs,
      admission.reconnectGraceMs,
      admission.now + admission.emptyRoomTtlMs
    );
    if (inserted === undefined) {
      throw new ApiError(409, "room_exists", "Sala já existe.");
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO slots
        (slot, session_id, joined_at)
       VALUES ('p1', ?, ?)`,
      admission.sessionId,
      admission.now
    );
    const issued = this.issueNonce(
      admission.sessionId,
      "p1",
      admission.now,
      admission.ticketTtlMs
    );
    await this.scheduleAlarm();
    await logRoomEvent("room_created", roomCode, { slot: "p1" });
    return internalOk(issued, 201);
  }

  private async join(request: Request): Promise<Response> {
    const admission = await this.readAdmission(request);
    this.checkAdmissionRate(admission.sessionId, admission.now);
    const room = this.ensureOpen(this.room(), admission.now);
    if (room.phase === "active") {
      throw new ApiError(409, "match_in_progress", "Partida já iniciada.");
    }
    const existing = this.first<SlotRow>(
      "SELECT * FROM slots WHERE session_id = ?",
      admission.sessionId
    );
    if (existing !== undefined) {
      const issued = this.issueNonce(
        admission.sessionId,
        existing.slot,
        admission.now,
        admission.ticketTtlMs
      );
      await this.scheduleAlarm();
      return internalOk(issued);
    }
    const inserted = this.first<SlotRow>(
      `INSERT INTO slots
        (slot, session_id, joined_at)
       VALUES ('p2', ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      admission.sessionId,
      admission.now
    );
    if (inserted === undefined) {
      const concurrentExisting = this.first<SlotRow>(
        "SELECT * FROM slots WHERE session_id = ?",
        admission.sessionId
      );
      if (concurrentExisting !== undefined) {
        const issued = this.issueNonce(
          admission.sessionId,
          concurrentExisting.slot,
          admission.now,
          admission.ticketTtlMs
        );
        await this.scheduleAlarm();
        return internalOk(issued);
      }
      throw new ApiError(409, "room_full", "Sala lotada.");
    }
    this.ctx.storage.sql.exec(
      "UPDATE room SET updated_at = ? WHERE id = 1",
      admission.now
    );
    const issued = this.issueNonce(
      admission.sessionId,
      "p2",
      admission.now,
      admission.ticketTtlMs
    );
    await this.scheduleAlarm();
    this.broadcast({
      protocolVersion: PROTOCOL_VERSION,
      type: "peer_joined",
      slot: "p2"
    });
    await logRoomEvent("player_joined", room.room_code, { slot: "p2" });
    return internalOk(issued);
  }

  private async reconnect(request: Request): Promise<Response> {
    const admission = await this.readAdmission(request);
    this.checkAdmissionRate(admission.sessionId, admission.now);
    const room = this.ensureOpen(this.room(), admission.now);
    const existing = this.first<SlotRow>(
      "SELECT * FROM slots WHERE session_id = ?",
      admission.sessionId
    );
    if (existing === undefined) {
      throw new ApiError(
        404,
        "player_not_found",
        "Sessão não pertence à sala."
      );
    }
    if (
      existing.connected === 0 &&
      existing.reconnect_deadline !== null &&
      existing.reconnect_deadline < admission.now
    ) {
      throw new ApiError(
        410,
        "reconnect_expired",
        "Prazo de reconexão expirado."
      );
    }
    const issued = this.issueNonce(
      admission.sessionId,
      existing.slot,
      admission.now,
      admission.ticketTtlMs
    );
    await this.scheduleAlarm();
    await logRoomEvent("player_reconnected", room.room_code, {
      slot: existing.slot
    });
    return internalOk(issued);
  }

  private socketHeader(request: Request, name: string): string {
    const value = request.headers.get(name);
    if (value === null || value.length === 0 || value.length > 256) {
      throw new ApiError(401, "invalid_socket_ticket", "Ticket inválido.");
    }
    return value;
  }

  private consumeNonce(
    nonce: string,
    sessionId: string,
    slot: PlayerSlot,
    expiresAt: number,
    now: number
  ): void {
    const consumed = this.first<NonceRow>(
      `UPDATE ticket_nonces
       SET consumed_at = ?
       WHERE nonce = ? AND session_id = ? AND slot = ?
         AND expires_at = ? AND expires_at > ?
         AND consumed_at IS NULL AND invalidated_at IS NULL
       RETURNING nonce`,
      now,
      nonce,
      sessionId,
      slot,
      expiresAt,
      now
    );
    if (consumed === undefined) {
      throw new ApiError(
        401,
        "socket_ticket_consumed",
        "Ticket inválido, expirado ou já utilizado."
      );
    }
  }

  private async openSocket(
    request: Request,
    roomCode: string
  ): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      throw new ApiError(426, "upgrade_required", "Upgrade obrigatório.");
    }
    const sessionId = this.socketHeader(request, "X-Session-Id");
    const slotValue = this.socketHeader(request, "X-Player-Slot");
    const nonce = this.socketHeader(request, "X-Ticket-Nonce");
    const expiresAtValue = this.socketHeader(
      request,
      "X-Ticket-Expires-At"
    );
    if (slotValue !== "p1" && slotValue !== "p2") {
      throw new ApiError(401, "invalid_socket_ticket", "Ticket inválido.");
    }
    const expiresAt = Number.parseInt(expiresAtValue, 10);
    if (!Number.isSafeInteger(expiresAt)) {
      throw new ApiError(401, "invalid_socket_ticket", "Ticket inválido.");
    }

    const now = Date.now();
    const room = this.ensureOpen(this.room(), now);
    if (room.room_code !== roomCode) {
      throw new ApiError(401, "invalid_socket_ticket", "Ticket inválido.");
    }
    const player = this.slot(slotValue);
    if (player === undefined || player.session_id !== sessionId) {
      throw new ApiError(401, "invalid_socket_ticket", "Ticket inválido.");
    }
    this.consumeNonce(
      nonce,
      sessionId,
      slotValue,
      expiresAt,
      now
    );

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const tag = `${SLOT_TAG_PREFIX}${slotValue}`;
    const connectionId = crypto.randomUUID();
    for (const previous of this.ctx.getWebSockets(tag)) {
      previous.close(4001, "Conexão substituída.");
    }

    const attachment: SocketAttachment = {
      protocolVersion: PROTOCOL_VERSION,
      connectionId,
      sessionId,
      slot: slotValue,
      joinedAt: now,
      lastSequence: player.last_sequence,
      lastAckFrame: player.last_ack_frame,
      rateWindowStartedAt: now,
      rateWindowCount: 0,
      rateViolationCount: 0
    };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [tag]);
    this.ctx.storage.sql.exec(
      `INSERT INTO active_connections
         (slot, connection_id, session_id, connected_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (slot)
       DO UPDATE SET connection_id = excluded.connection_id,
                     session_id = excluded.session_id,
                     connected_at = excluded.connected_at`,
      slotValue,
      connectionId,
      sessionId,
      now
    );
    this.ctx.storage.sql.exec(
      `UPDATE slots
       SET connected = 1, disconnected_at = NULL, reconnect_deadline = NULL
       WHERE slot = ? AND session_id = ?`,
      slotValue,
      sessionId
    );
    this.ctx.storage.sql.exec(
      "UPDATE room SET empty_deadline = NULL, updated_at = ? WHERE id = 1",
      now
    );

    this.send(server, {
      protocolVersion: PROTOCOL_VERSION,
      type: "welcome",
      roomCode,
      slot: slotValue,
      serverTime: now
    });
    this.send(server, {
      protocolVersion: PROTOCOL_VERSION,
      type: "room_state",
      state: this.snapshot()
    });
    this.broadcast(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "peer_connected",
        slot: slotValue
      },
      slotValue
    );
    await this.scheduleAlarm();
    await logRoomEvent(
      player.disconnected_at === null
        ? "socket_connected"
        : "player_reconnected",
      roomCode,
      { slot: slotValue }
    );

    return new Response(null, {
      status: 101,
      headers: { "Sec-WebSocket-Protocol": SOCKET_PROTOCOL },
      webSocket: client
    });
  }

  private snapshot(): RoomSnapshot {
    const room = this.room();
    if (room === undefined) {
      throw new ApiError(404, "room_not_found", "Sala não encontrada.");
    }
    const players: RoomSnapshotPlayer[] = this.slots().map((slot) => ({
      slot: slot.slot,
      connected: slot.connected === 1,
      selected: slot.fighter_id !== null,
      ready: slot.ready === 1,
      fighterId: slot.fighter_id,
      arenaId: slot.arena_id
    }));
    return { roomCode: room.room_code, phase: room.phase, players };
  }

  private attachment(webSocket: WebSocket): SocketAttachment | undefined {
    const value = webSocket.deserializeAttachment() as unknown;
    if (!isPlainRecord(value)) return undefined;
    if (
      value.protocolVersion !== PROTOCOL_VERSION ||
      typeof value.connectionId !== "string" ||
      typeof value.sessionId !== "string" ||
      (value.slot !== "p1" && value.slot !== "p2")
    ) {
      return undefined;
    }
    return value as unknown as SocketAttachment;
  }

  private send(webSocket: WebSocket, message: unknown): void {
    try {
      webSocket.send(JSON.stringify(message));
    } catch {
      // O fechamento concorrente é tratado pelo callback de close.
    }
  }

  private broadcast(message: unknown, exceptSlot?: PlayerSlot): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket);
      if (attachment !== undefined && attachment.slot !== exceptSlot) {
        this.send(socket, message);
      }
    }
  }

  private sendError(
    webSocket: WebSocket,
    code: string,
    message: string
  ): void {
    this.send(webSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: "error",
      error: { code, message }
    });
  }

  private applyRateLimit(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    now: number
  ): boolean {
    if (now - attachment.rateWindowStartedAt >= RATE_LIMIT_WINDOW_MS) {
      attachment.rateWindowStartedAt = now;
      attachment.rateWindowCount = 0;
    }
    attachment.rateWindowCount += 1;
    if (attachment.rateWindowCount <= RATE_LIMIT_MESSAGES_PER_WINDOW) {
      webSocket.serializeAttachment(attachment);
      return true;
    }
    attachment.rateViolationCount += 1;
    webSocket.serializeAttachment(attachment);
    this.sendError(
      webSocket,
      "rate_limited",
      "Limite de mensagens excedido."
    );
    if (attachment.rateViolationCount >= 3) {
      webSocket.close(4008, "Limite de mensagens excedido.");
    }
    return false;
  }

  private readSocketMessage(message: string | ArrayBuffer): Record<string, unknown> {
    if (typeof message !== "string") {
      throw new ApiError(
        400,
        "binary_not_supported",
        "Mensagens binárias não são aceitas."
      );
    }
    if (new TextEncoder().encode(message).byteLength > MAX_WEBSOCKET_MESSAGE_BYTES) {
      throw new ApiError(
        413,
        "message_too_large",
        "Mensagem excede 16 KiB."
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(message) as unknown;
    } catch {
      throw new ApiError(400, "invalid_json", "JSON inválido.");
    }
    if (!isPlainRecord(value)) {
      throw new ApiError(400, "invalid_message", "Mensagem inválida.");
    }
    if (
      value.protocolVersion !== PROTOCOL_VERSION ||
      typeof value.type !== "string"
    ) {
      throw new ApiError(
        400,
        "protocol_mismatch",
        "Versão de protocolo incompatível."
      );
    }
    return value;
  }

  private validateSelection(value: Record<string, unknown>): Selection {
    if (
      !hasExactKeys(value, [
        "protocolVersion",
        "type",
        "fighterId",
        "arenaId",
        "clientBuildId",
        "engineVersion",
        "assetRevision"
      ])
    ) {
      throw new ApiError(400, "invalid_message", "Seleção inválida.");
    }
    const fighterId = requireString(value.fighterId, "fighterId", 1, 32);
    const arenaId = requireString(value.arenaId, "arenaId", 1, 32);
    if (!ALLOWED_FIGHTERS.has(fighterId) || !ALLOWED_ARENAS.has(arenaId)) {
      throw new ApiError(400, "invalid_selection", "Seleção não permitida.");
    }
    return {
      fighterId,
      arenaId,
      clientBuildId: requireString(
        value.clientBuildId,
        "clientBuildId",
        1,
        64
      ),
      engineVersion: requireString(
        value.engineVersion,
        "engineVersion",
        1,
        64
      ),
      assetRevision: requireString(
        value.assetRevision,
        "assetRevision",
        1,
        64
      )
    };
  }

  private handleSelection(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    value: Record<string, unknown>,
    now: number
  ): void {
    const room = this.ensureOpen(this.room(), now);
    if (room.phase === "active") {
      throw new ApiError(
        409,
        "selection_locked",
        "Seleção bloqueada após o início."
      );
    }
    const selection = this.validateSelection(value);
    this.ctx.storage.sql.exec(
      `UPDATE slots
       SET fighter_id = ?, arena_id = ?, client_build_id = ?,
           engine_version = ?, asset_revision = ?, ready = 0
       WHERE slot = ? AND session_id = ?`,
      selection.fighterId,
      selection.arenaId,
      selection.clientBuildId,
      selection.engineVersion,
      selection.assetRevision,
      attachment.slot,
      attachment.sessionId
    );
    this.updatePreMatchPhase(now);
    this.broadcast({
      protocolVersion: PROTOCOL_VERSION,
      type: "selection",
      slot: attachment.slot,
      selection
    });
    this.broadcast({
      protocolVersion: PROTOCOL_VERSION,
      type: "room_state",
      state: this.snapshot()
    });
    this.send(webSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: "selection_ack",
      selection
    });
  }

  private updatePreMatchPhase(now: number): void {
    const slots = this.slots();
    const readyForReadyPhase =
      slots.length === 2 &&
      slots.every((slot) => slot.fighter_id !== null && slot.arena_id !== null);
    this.ctx.storage.sql.exec(
      `UPDATE room SET phase = ?, updated_at = ?
       WHERE id = 1 AND phase != 'active' AND phase != 'closed'`,
      readyForReadyPhase ? "ready" : "waiting",
      now
    );
  }

  private compatibleSelections(slots: SlotRow[]): boolean {
    const first = slots[0];
    const second = slots[1];
    return (
      first !== undefined &&
      second !== undefined &&
      first.client_build_id === second.client_build_id &&
      first.engine_version === second.engine_version &&
      first.asset_revision === second.asset_revision &&
      first.arena_id === second.arena_id
    );
  }

  private handleReady(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    value: Record<string, unknown>,
    now: number
  ): void {
    if (!hasExactKeys(value, ["protocolVersion", "type", "ready"])) {
      throw new ApiError(400, "invalid_message", "Ready inválido.");
    }
    if (typeof value.ready !== "boolean") {
      throw new ApiError(400, "invalid_message", "Ready inválido.");
    }
    const room = this.ensureOpen(this.room(), now);
    if (room.phase === "active") {
      throw new ApiError(409, "match_started", "Partida já iniciada.");
    }
    const player = this.slot(attachment.slot);
    if (
      player === undefined ||
      player.fighter_id === null ||
      player.arena_id === null
    ) {
      throw new ApiError(
        409,
        "selection_required",
        "Selecione lutador e arena antes de confirmar."
      );
    }
    this.ctx.storage.sql.exec(
      "UPDATE slots SET ready = ? WHERE slot = ? AND session_id = ?",
      value.ready ? 1 : 0,
      attachment.slot,
      attachment.sessionId
    );
    this.broadcast({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      slot: attachment.slot,
      ready: value.ready
    });

    const slots = this.slots();
    if (
      slots.length !== 2 ||
      !slots.every((slot) => slot.ready === 1 && slot.connected === 1)
    ) {
      this.updatePreMatchPhase(now);
      return;
    }
    if (!this.compatibleSelections(slots)) {
      this.ctx.storage.sql.exec(
        "UPDATE slots SET ready = 0 WHERE slot = ?",
        attachment.slot
      );
      this.sendError(
        webSocket,
        "client_version_mismatch",
        "Build, engine, assets e arena devem coincidir."
      );
      return;
    }

    const seedBytes = new Uint32Array(1);
    crypto.getRandomValues(seedBytes);
    const seed = seedBytes[0] ?? 0;
    const startAt = now + 1_500;
    const inputDelay = room.input_delay ?? 8;
    const started = this.first<CountRow>(
      `UPDATE room
       SET phase = 'active', seed = ?, start_at = ?, input_delay = ?,
           updated_at = ?
       WHERE id = 1 AND phase != 'active' AND closed_at IS NULL
       RETURNING 1 AS count`,
      seed,
      startAt,
      inputDelay,
      now
    );
    if (started === undefined) return;
    const players = slots.map((slot) => ({
        slot: slot.slot,
        fighterId: slot.fighter_id,
        arenaId: slot.arena_id
      }));
    for (const socket of this.ctx.getWebSockets()) {
      const socketAttachment = this.attachment(socket);
      if (socketAttachment === undefined) continue;
      this.send(socket, {
        protocolVersion: PROTOCOL_VERSION,
        type: "start",
        slot: socketAttachment.slot,
        seed,
        startAt,
        inputDelay,
        players
      });
    }
    void logRoomEvent("match_started", room.room_code, { inputDelay });
  }

  private serverFrame(room: RoomRow, now: number): number {
    if (room.start_at === null || now <= room.start_at) return 0;
    return Math.floor((now - room.start_at) / SERVER_FRAME_MS);
  }

  private parseInputFrames(
    value: unknown,
    player: SlotRow,
    maximumFrame: number,
    initialHeldMask: number
  ): InputFrame[] {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > MAX_INPUT_FRAMES_PER_BATCH
    ) {
      throw new ApiError(400, "invalid_input_batch", "Batch de input inválido.");
    }
    const frames: InputFrame[] = [];
    let expectedFrame = player.last_input_frame + 1;
    let previousHeldMask = initialHeldMask;
    for (const item of value) {
      if (
        !isPlainRecord(item) ||
        !hasExactKeys(item, [
          "frame",
          "heldMask",
          "pressedMask",
          "releasedMask"
        ]) ||
        !isIntegerBetween(item.frame, 0, maximumFrame) ||
        !isIntegerBetween(item.heldMask, 0, 255) ||
        !isIntegerBetween(item.pressedMask, 0, 255) ||
        !isIntegerBetween(item.releasedMask, 0, 255)
      ) {
        throw new ApiError(
          400,
          "invalid_input_batch",
          "Frame de input inválido."
        );
      }
      if (item.frame !== expectedFrame) {
        throw new ApiError(
          409,
          "input_frame_gap",
          "Frames devem ser consecutivos."
        );
      }
      if (
        (item.pressedMask & item.heldMask) !== item.pressedMask ||
        (item.releasedMask & item.heldMask) !== 0 ||
        (item.pressedMask & item.releasedMask) !== 0 ||
        item.pressedMask !== (item.heldMask & ~previousHeldMask) ||
        item.releasedMask !== (previousHeldMask & ~item.heldMask)
      ) {
        throw new ApiError(
          400,
          "invalid_input_mask",
          "Transição de input inconsistente."
        );
      }
      frames.push({
        frame: item.frame,
        heldMask: item.heldMask,
        pressedMask: item.pressedMask,
        releasedMask: item.releasedMask
      });
      previousHeldMask = item.heldMask;
      expectedFrame += 1;
    }
    return frames;
  }

  private handleInputBatch(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    value: Record<string, unknown>,
    now: number
  ): void {
    if (
      !hasExactKeys(value, [
        "protocolVersion",
        "type",
        "sequence",
        "ackSequence",
        "startFrame",
        "frames"
      ])
    ) {
      throw new ApiError(400, "invalid_input_batch", "Batch de input inválido.");
    }
    const room = this.ensureOpen(this.room(), now);
    if (room.phase !== "active") {
      throw new ApiError(409, "match_not_active", "Partida não está ativa.");
    }
    const player = this.slot(attachment.slot);
    if (player === undefined) {
      throw new ApiError(401, "player_not_found", "Jogador não encontrado.");
    }
    if (!isIntegerBetween(value.sequence, 0, Number.MAX_SAFE_INTEGER)) {
      throw new ApiError(400, "invalid_sequence", "Sequência inválida.");
    }
    if (value.sequence === player.last_sequence) return;
    if (value.sequence !== player.last_sequence + 1) {
      throw new ApiError(
        409,
        "sequence_gap",
        "Sequência fora de ordem."
      );
    }
    const maximumFrame =
      this.serverFrame(room, now) + MAX_FUTURE_INPUT_FRAMES;
    if (!isIntegerBetween(value.startFrame, 0, maximumFrame)) {
      throw new ApiError(
        400,
        "invalid_start_frame",
        "Start frame inválido."
      );
    }
    const peerLastSequence =
      this.slot(oppositeSlot(attachment.slot))?.last_sequence ?? -1;
    if (
      !isIntegerBetween(value.ackSequence, -1, Number.MAX_SAFE_INTEGER) ||
      value.ackSequence > peerLastSequence
    ) {
      throw new ApiError(
        400,
        "invalid_ack_sequence",
        "Ack sequence inválido."
      );
    }
    const inputState = this.first<InputStateRow>(
      "SELECT last_held_mask FROM input_states WHERE slot = ?",
      attachment.slot
    );
    const frames = this.parseInputFrames(
      value.frames,
      player,
      maximumFrame,
      inputState?.last_held_mask ?? 0
    );
    const lastFrame = frames.at(-1);
    if (lastFrame === undefined) return;
    if (value.startFrame !== frames[0]?.frame) {
      throw new ApiError(
        400,
        "invalid_start_frame",
        "Start frame não coincide com o lote."
      );
    }
    this.ctx.storage.sql.exec(
      `UPDATE slots
       SET last_sequence = ?, last_input_frame = ?, last_ack_frame = ?
       WHERE slot = ? AND session_id = ?`,
      value.sequence,
      lastFrame.frame,
      lastFrame.frame,
      attachment.slot,
      attachment.sessionId
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO input_states (slot, last_held_mask)
       VALUES (?, ?)
       ON CONFLICT (slot)
       DO UPDATE SET last_held_mask = excluded.last_held_mask`,
      attachment.slot,
      lastFrame.heldMask
    );
    attachment.lastSequence = value.sequence;
    attachment.lastAckFrame = lastFrame.frame;
    webSocket.serializeAttachment(attachment);

    for (const peer of this.ctx.getWebSockets(
      `${SLOT_TAG_PREFIX}${oppositeSlot(attachment.slot)}`
    )) {
      this.send(peer, {
        protocolVersion: PROTOCOL_VERSION,
        type: "input_batch",
        fromSlot: attachment.slot,
        sequence: value.sequence,
        ackSequence: value.ackSequence,
        startFrame: value.startFrame,
        frames
      });
    }
  }

  private handleStateHash(
    attachment: SocketAttachment,
    value: Record<string, unknown>,
    now: number
  ): void {
    if (
      !hasExactKeys(value, [
        "protocolVersion",
        "type",
        "frame",
        "hash"
      ]) ||
      typeof value.hash !== "string" ||
      !/^[a-f0-9]{16,64}$/u.test(value.hash)
    ) {
      throw new ApiError(400, "invalid_state_hash", "Hash inválido.");
    }
    const room = this.ensureOpen(this.room(), now);
    if (room.phase !== "active") {
      throw new ApiError(409, "match_not_active", "Partida não está ativa.");
    }
    const maximumFrame =
      this.serverFrame(room, now) + MAX_HASH_FUTURE_FRAMES;
    if (!isIntegerBetween(value.frame, 0, maximumFrame)) {
      throw new ApiError(400, "invalid_hash_frame", "Frame de hash inválido.");
    }
    const previous = this.first<HashRow>(
      "SELECT state_hash FROM state_hashes WHERE frame = ? AND slot = ?",
      value.frame,
      attachment.slot
    );
    if (previous !== undefined) {
      if (previous.state_hash === value.hash) return;
      throw new ApiError(
        409,
        "state_hash_changed",
        "Hash já confirmado para este slot e frame."
      );
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO state_hashes (frame, slot, state_hash, received_at)
       VALUES (?, ?, ?, ?)`,
      value.frame,
      attachment.slot,
      value.hash,
      now
    );
    for (const peer of this.ctx.getWebSockets(
      `${SLOT_TAG_PREFIX}${oppositeSlot(attachment.slot)}`
    )) {
      this.send(peer, {
        protocolVersion: PROTOCOL_VERSION,
        type: "state_hash",
        fromSlot: attachment.slot,
        frame: value.frame,
        hash: value.hash
      });
    }

    const other = this.first<HashRow>(
      "SELECT state_hash FROM state_hashes WHERE frame = ? AND slot = ?",
      value.frame,
      oppositeSlot(attachment.slot)
    );
    if (other === undefined) return;
    if (other.state_hash === value.hash) {
      this.ctx.storage.sql.exec(
        `UPDATE room SET last_confirmed_frame = MAX(last_confirmed_frame, ?)
         WHERE id = 1`,
        value.frame
      );
      return;
    }
    const firstDesync = this.first<CountRow>(
      `INSERT INTO desyncs (frame, detected_at) VALUES (?, ?)
       ON CONFLICT (frame) DO NOTHING
       RETURNING 1 AS count`,
      value.frame,
      now
    );
    if (firstDesync !== undefined) {
      this.broadcast({
        protocolVersion: PROTOCOL_VERSION,
        type: "desync",
        frame: value.frame
      });
      void logRoomEvent("desync_detected", room.room_code, {
        frame: value.frame
      });
    }
  }

  private handleLatencyPing(
    webSocket: WebSocket,
    value: Record<string, unknown>,
    now: number
  ): void {
    if (
      !hasExactKeys(value, [
        "protocolVersion",
        "type",
        "clientTime"
      ]) ||
      typeof value.clientTime !== "number" ||
      !Number.isFinite(value.clientTime)
    ) {
      throw new ApiError(400, "invalid_latency_ping", "Ping inválido.");
    }
    this.send(webSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: "latency_pong",
      clientTime: value.clientTime,
      serverTime: now
    });
  }

  override async fetch(request: Request): Promise<Response> {
    try {
      this.requireInternal(request);
      const url = new URL(request.url);
      const roomCode = this.readRoomCode(request);
      if (request.method === "POST" && url.pathname === "/internal/create") {
        return await this.create(request, roomCode);
      }
      if (request.method === "POST" && url.pathname === "/internal/join") {
        return await this.join(request);
      }
      if (
        request.method === "POST" &&
        url.pathname === "/internal/reconnect"
      ) {
        return await this.reconnect(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/ws") {
        return await this.openSocket(request, roomCode);
      }
      throw new ApiError(404, "not_found", "Rota não encontrada.");
    } catch (error) {
      return apiErrorResponse(error);
    }
  }

  override async webSocketMessage(
    webSocket: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const attachment = this.attachment(webSocket);
    if (attachment === undefined) {
      webSocket.close(4003, "Sessão de socket inválida.");
      return;
    }
    const activeConnection = this.first<
      Record<string, SqlStorageValue> & { connection_id: string }
    >(
      `SELECT connection_id FROM active_connections
       WHERE slot = ? AND session_id = ?`,
      attachment.slot,
      attachment.sessionId
    );
    if (activeConnection?.connection_id !== attachment.connectionId) {
      webSocket.close(4001, "Conexão substituída.");
      return;
    }
    const now = Date.now();
    if (!this.applyRateLimit(webSocket, attachment, now)) return;
    try {
      const value = this.readSocketMessage(message);
      switch (value.type) {
        case "select":
          this.handleSelection(webSocket, attachment, value, now);
          break;
        case "ready":
          this.handleReady(webSocket, attachment, value, now);
          break;
        case "input_batch":
          this.handleInputBatch(webSocket, attachment, value, now);
          break;
        case "state_hash":
          this.handleStateHash(attachment, value, now);
          break;
        case "latency_ping":
          this.handleLatencyPing(webSocket, value, now);
          break;
        case "leave":
          if (!hasExactKeys(value, ["protocolVersion", "type"])) {
            throw new ApiError(400, "invalid_message", "Leave inválido.");
          }
          webSocket.close(1000, "Saída voluntária.");
          break;
        default:
          throw new ApiError(
            400,
            "unknown_message_type",
            "Tipo de mensagem desconhecido."
          );
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const room = this.room();
        if (room !== undefined) {
          void logRoomEvent("invalid_message", room.room_code, {
            slot: attachment.slot,
            code: error.code
          });
        }
        this.sendError(webSocket, error.code, error.message);
        if (error.status === 413) {
          webSocket.close(4009, "Mensagem muito grande.");
        }
        return;
      }
      console.error(
        JSON.stringify({
          event: "websocket_message_error",
          message: error instanceof Error ? error.message : "unknown"
        })
      );
      this.sendError(webSocket, "internal_error", "Erro interno do servidor.");
    }
  }

  override async webSocketClose(
    webSocket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    const attachment = this.attachment(webSocket);
    if (attachment === undefined) return;
    await this.markDisconnected(
      webSocket,
      attachment,
      code,
      reason,
      wasClean,
      Date.now()
    );
  }

  override async webSocketError(
    webSocket: WebSocket,
    error: unknown
  ): Promise<void> {
    const attachment = this.attachment(webSocket);
    if (attachment === undefined) return;
    console.error(
      JSON.stringify({
        event: "websocket_error",
        slot: attachment.slot,
        reason: error instanceof Error ? "transport_error" : "unknown"
      })
    );
    await this.markDisconnected(
      webSocket,
      attachment,
      1011,
      "Erro de transporte.",
      false,
      Date.now()
    );
  }

  private async markDisconnected(
    _sourceSocket: WebSocket,
    attachment: SocketAttachment,
    code: number,
    _reason: string,
    wasClean: boolean,
    now: number
  ): Promise<void> {
    const activeConnection = this.first<
      Record<string, SqlStorageValue> & { connection_id: string }
    >(
      `SELECT connection_id FROM active_connections
       WHERE slot = ? AND session_id = ?`,
      attachment.slot,
      attachment.sessionId
    );
    if (activeConnection?.connection_id !== attachment.connectionId) return;
    this.ctx.storage.sql.exec(
      `DELETE FROM active_connections
       WHERE slot = ? AND session_id = ? AND connection_id = ?`,
      attachment.slot,
      attachment.sessionId,
      attachment.connectionId
    );

    const room = this.room();
    if (room === undefined || room.phase === "closed") return;
    const graceMs = room.reconnect_grace_ms;
    this.ctx.storage.sql.exec(
      `UPDATE slots
       SET connected = 0, disconnected_at = ?, reconnect_deadline = ?
       WHERE slot = ? AND session_id = ?`,
      now,
      now + graceMs,
      attachment.slot,
      attachment.sessionId
    );
    const connected = this.first<CountRow>(
      "SELECT COUNT(*) AS count FROM slots WHERE connected = 1"
    );
    if ((connected?.count ?? 0) === 0) {
      this.ctx.storage.sql.exec(
        "UPDATE room SET empty_deadline = ?, updated_at = ? WHERE id = 1",
        now + room.empty_room_ttl_ms,
        now
      );
    }
    this.broadcast(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "peer_disconnected",
        slot: attachment.slot,
        reconnectDeadline: now + graceMs
      },
      attachment.slot
    );
    await this.scheduleAlarm();
    await logRoomEvent("disconnect", room.room_code, {
      slot: attachment.slot,
      code,
      clean: wasClean,
      reason: code === 1000 ? "normal_close" : "transport_close"
    });
  }

  private async closeRoom(reason: string, now: number): Promise<void> {
    const room = this.room();
    if (room === undefined || room.phase === "closed") return;
    const closed = this.first<CountRow>(
      `UPDATE room
       SET phase = 'closed', closed_at = ?, close_reason = ?, updated_at = ?
       WHERE id = 1 AND phase != 'closed'
       RETURNING 1 AS count`,
      now,
      reason,
      now
    );
    if (closed === undefined) return;
    this.broadcast({
      protocolVersion: PROTOCOL_VERSION,
      type: "room_closed",
      reason
    });
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(4004, "Sala encerrada.");
    }
    await this.ctx.storage.deleteAlarm();
    if (reason === "room_expired" || reason === "room_abandoned") {
      await logRoomEvent("room_expired", room.room_code, { reason });
    }
    await logRoomEvent("room_closed", room.room_code, { reason });
  }

  private async scheduleAlarm(): Promise<void> {
    const room = this.room();
    if (room === undefined || room.phase === "closed") {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const deadlines = [room.expires_at];
    if (room.empty_deadline !== null) deadlines.push(room.empty_deadline);
    for (const slot of this.slots()) {
      if (slot.connected === 0 && slot.reconnect_deadline !== null) {
        deadlines.push(slot.reconnect_deadline);
      }
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const room = this.room();
    if (room === undefined || room.phase === "closed") {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (room.expires_at <= now) {
      await this.closeRoom("room_expired", now);
      return;
    }
    if (room.empty_deadline !== null && room.empty_deadline <= now) {
      await this.closeRoom("room_abandoned", now);
      return;
    }

    const expired = this.slots().filter(
      (slot) =>
        slot.connected === 0 &&
        slot.reconnect_deadline !== null &&
        slot.reconnect_deadline <= now
    );
    for (const slot of expired) {
      if (room.phase === "active" || slot.slot === "p1") {
        await this.closeRoom("reconnect_expired", now);
        return;
      }
      this.ctx.storage.sql.exec(
        "DELETE FROM slots WHERE slot = ? AND connected = 0",
        slot.slot
      );
      this.ctx.storage.sql.exec(
        "DELETE FROM active_connections WHERE slot = ?",
        slot.slot
      );
      this.ctx.storage.sql.exec(
        "DELETE FROM input_states WHERE slot = ?",
        slot.slot
      );
      this.broadcast({
        protocolVersion: PROTOCOL_VERSION,
        type: "player_removed",
        slot: slot.slot
      });
    }
    this.ctx.storage.sql.exec(
      `DELETE FROM ticket_nonces
       WHERE expires_at <= ? OR invalidated_at IS NOT NULL`,
      now
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM state_hashes WHERE frame < ?",
      Math.max(0, room.last_confirmed_frame - 600)
    );
    await this.scheduleAlarm();
  }
}
