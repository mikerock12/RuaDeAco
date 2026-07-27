import type { PROTOCOL_VERSION } from "./config";

export type PlayerSlot = "p1" | "p2";
export type RoomPhase = "waiting" | "ready" | "active" | "closed";

export interface SessionClaims {
  t: "session";
  v: typeof PROTOCOL_VERSION;
  sid: string;
  iat: number;
  exp: number;
}

export interface SocketTicketClaims {
  t: "socket";
  v: typeof PROTOCOL_VERSION;
  sid: string;
  room: string;
  slot: PlayerSlot;
  nonce: string;
  iat: number;
  exp: number;
}

export interface Selection {
  fighterId: string;
  arenaId: string;
  clientBuildId: string;
  engineVersion: string;
  assetRevision: string;
}

export interface InputFrame {
  frame: number;
  heldMask: number;
  pressedMask: number;
  releasedMask: number;
}

export interface SocketAttachment {
  protocolVersion: typeof PROTOCOL_VERSION;
  connectionId: string;
  sessionId: string;
  slot: PlayerSlot;
  joinedAt: number;
  lastSequence: number;
  lastAckFrame: number;
  rateWindowStartedAt: number;
  rateWindowCount: number;
  rateViolationCount: number;
}

export interface RoomSnapshotPlayer {
  slot: PlayerSlot;
  connected: boolean;
  selected: boolean;
  ready: boolean;
  fighterId: string | null;
  arenaId: string | null;
}

export interface RoomSnapshot {
  roomCode: string;
  phase: RoomPhase;
  players: RoomSnapshotPlayer[];
}

export interface IssuedAdmission {
  roomCode: string;
  slot: PlayerSlot;
  nonce: string;
  nonceExpiresAt: number;
}

export interface InternalAdmissionRequest {
  sessionId: string;
  now: number;
  ticketTtlMs: number;
  roomTtlMs: number;
  emptyRoomTtlMs: number;
  reconnectGraceMs: number;
}
