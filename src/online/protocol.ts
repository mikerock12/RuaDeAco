import type { FighterId } from '../types/combat';

export type PlayerSlot = 'p1' | 'p2';
export type RoomPhase = 'waiting' | 'ready' | 'active' | 'closed';

export interface SessionData {
  readonly sessionToken: string;
  readonly sessionId: string;
  readonly expiresAt: number;
  readonly protocolVersion: 1;
}

export interface AdmissionData {
  readonly roomCode: string;
  readonly slot: PlayerSlot;
  readonly socketTicket: string;
  readonly socketTicketExpiresAt: number;
  readonly websocketUrl: string;
  readonly websocketProtocols: readonly [string, string];
}

export interface RoomPlayer {
  readonly slot: PlayerSlot;
  readonly connected: boolean;
  readonly selected: boolean;
  readonly ready: boolean;
  readonly fighterId: FighterId | null;
  readonly arenaId: 'cais-da-cidade' | null;
}

export interface RoomState {
  readonly roomCode: string;
  readonly phase: RoomPhase;
  readonly players: readonly RoomPlayer[];
}

export interface StartPlayer {
  readonly slot: PlayerSlot;
  readonly fighterId: FighterId;
  readonly arenaId: 'cais-da-cidade';
}

export interface StartMessage {
  readonly protocolVersion: 1;
  readonly type: 'start';
  readonly slot: PlayerSlot;
  readonly seed: number;
  readonly startAt: number;
  readonly inputDelay: number;
  readonly players: readonly StartPlayer[];
}

export interface WireInputFrame {
  readonly frame: number;
  readonly heldMask: number;
  readonly pressedMask: number;
  readonly releasedMask: number;
}

export type ServerMessage =
  | { readonly protocolVersion: 1; readonly type: 'welcome'; readonly roomCode: string; readonly slot: PlayerSlot; readonly serverTime: number }
  | { readonly protocolVersion: 1; readonly type: 'room_state'; readonly state: RoomState }
  | { readonly protocolVersion: 1; readonly type: 'peer_joined' | 'peer_connected'; readonly slot: PlayerSlot }
  | { readonly protocolVersion: 1; readonly type: 'peer_disconnected'; readonly slot: PlayerSlot; readonly reconnectDeadline: number }
  | { readonly protocolVersion: 1; readonly type: 'player_removed'; readonly slot: PlayerSlot }
  | { readonly protocolVersion: 1; readonly type: 'selection'; readonly slot: PlayerSlot; readonly selection: SelectionMessageData }
  | { readonly protocolVersion: 1; readonly type: 'selection_ack'; readonly selection: SelectionMessageData }
  | { readonly protocolVersion: 1; readonly type: 'ready'; readonly slot: PlayerSlot; readonly ready: boolean }
  | StartMessage
  | { readonly protocolVersion: 1; readonly type: 'input_batch'; readonly fromSlot: PlayerSlot; readonly sequence: number; readonly ackSequence: number; readonly startFrame: number; readonly frames: readonly WireInputFrame[] }
  | { readonly protocolVersion: 1; readonly type: 'state_hash'; readonly fromSlot: PlayerSlot; readonly frame: number; readonly hash: string }
  | { readonly protocolVersion: 1; readonly type: 'desync'; readonly frame: number }
  | { readonly protocolVersion: 1; readonly type: 'latency_pong'; readonly clientTime: number; readonly serverTime: number }
  | { readonly protocolVersion: 1; readonly type: 'room_closed'; readonly reason: string }
  | { readonly protocolVersion: 1; readonly type: 'error'; readonly error: { readonly code: string; readonly message: string } };

export interface SelectionMessageData {
  readonly fighterId: FighterId;
  readonly arenaId: 'cais-da-cidade';
  readonly clientBuildId: string;
  readonly engineVersion: string;
  readonly assetRevision: string;
}

const fighters = new Set<FighterId>([
  'rafa-mare',
  'guto-barba',
  'astro-riso',
  'dante-sinal',
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSlot = (value: unknown): value is PlayerSlot => value === 'p1' || value === 'p2';
const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isFighter = (value: unknown): value is FighterId =>
  typeof value === 'string' && fighters.has(value as FighterId);
const stringField = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

function parsePlayer(value: unknown): RoomPlayer | null {
  if (!isRecord(value) || !isSlot(value.slot) || typeof value.connected !== 'boolean'
    || typeof value.selected !== 'boolean' || typeof value.ready !== 'boolean') return null;
  if (value.fighterId !== null && !isFighter(value.fighterId)) return null;
  if (value.arenaId !== null && value.arenaId !== 'cais-da-cidade') return null;
  return {
    slot: value.slot,
    connected: value.connected,
    selected: value.selected,
    ready: value.ready,
    fighterId: value.fighterId,
    arenaId: value.arenaId,
  };
}

function parseRoomState(value: unknown): RoomState | null {
  if (!isRecord(value) || !stringField(value.roomCode)
    || !['waiting', 'ready', 'active', 'closed'].includes(String(value.phase))
    || !Array.isArray(value.players)) return null;
  const players = value.players.map(parsePlayer);
  if (players.some((player) => player === null)) return null;
  return {
    roomCode: value.roomCode,
    phase: value.phase as RoomPhase,
    players: players as RoomPlayer[],
  };
}

function parseSelection(value: unknown): SelectionMessageData | null {
  if (!isRecord(value) || !isFighter(value.fighterId)
    || value.arenaId !== 'cais-da-cidade'
    || !stringField(value.clientBuildId)
    || !stringField(value.engineVersion)
    || !stringField(value.assetRevision)) return null;
  return value as unknown as SelectionMessageData;
}

function parseWireFrame(value: unknown): WireInputFrame | null {
  if (!isRecord(value) || !isInteger(value.frame) || !isInteger(value.heldMask)
    || !isInteger(value.pressedMask) || !isInteger(value.releasedMask)
    || value.frame < 0 || value.heldMask < 0 || value.heldMask > 255
    || value.pressedMask < 0 || value.pressedMask > 255
    || value.releasedMask < 0 || value.releasedMask > 255) return null;
  return value as unknown as WireInputFrame;
}

export function parseServerMessage(raw: string): ServerMessage {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Servidor enviou JSON inválido.');
  }
  if (!isRecord(value) || value.protocolVersion !== 1 || !stringField(value.type)) {
    throw new Error('Servidor enviou mensagem incompatível.');
  }
  const type = value.type;
  if (type === 'welcome' && stringField(value.roomCode) && isSlot(value.slot) && isInteger(value.serverTime)) {
    return value as unknown as ServerMessage;
  }
  if (type === 'room_state') {
    const state = parseRoomState(value.state);
    if (state) return { protocolVersion: 1, type, state };
  }
  if ((type === 'peer_joined' || type === 'peer_connected' || type === 'player_removed') && isSlot(value.slot)) {
    return value as unknown as ServerMessage;
  }
  if (type === 'peer_disconnected' && isSlot(value.slot) && isInteger(value.reconnectDeadline)) {
    return value as unknown as ServerMessage;
  }
  if (type === 'selection' && isSlot(value.slot)) {
    const selection = parseSelection(value.selection);
    if (selection) return { protocolVersion: 1, type, slot: value.slot, selection };
  }
  if (type === 'selection_ack') {
    const selection = parseSelection(value.selection);
    if (selection) return { protocolVersion: 1, type, selection };
  }
  if (type === 'ready' && isSlot(value.slot) && typeof value.ready === 'boolean') {
    return value as unknown as ServerMessage;
  }
  if (type === 'start' && isSlot(value.slot) && isInteger(value.seed)
    && isInteger(value.startAt) && isInteger(value.inputDelay)
    && value.inputDelay >= 2 && value.inputDelay <= 12 && Array.isArray(value.players)) {
    const players = value.players.filter(isRecord).map((player) => (
      isSlot(player.slot) && isFighter(player.fighterId) && player.arenaId === 'cais-da-cidade'
        ? { slot: player.slot, fighterId: player.fighterId, arenaId: player.arenaId }
        : null
    ));
    if (players.length === 2 && players.every((player) => player !== null)) {
      return { protocolVersion: 1, type, slot: value.slot, seed: value.seed, startAt: value.startAt, inputDelay: value.inputDelay, players: players as StartPlayer[] };
    }
  }
  if (type === 'input_batch' && isSlot(value.fromSlot) && isInteger(value.sequence)
    && isInteger(value.ackSequence) && isInteger(value.startFrame) && Array.isArray(value.frames)) {
    const frames = value.frames.map(parseWireFrame);
    if (frames.length >= 1 && frames.length <= 3 && frames.every((frame) => frame !== null)) {
      return { protocolVersion: 1, type, fromSlot: value.fromSlot, sequence: value.sequence, ackSequence: value.ackSequence, startFrame: value.startFrame, frames: frames as WireInputFrame[] };
    }
  }
  if (type === 'state_hash' && isSlot(value.fromSlot) && isInteger(value.frame)
    && typeof value.hash === 'string' && /^[a-f0-9]{16,64}$/u.test(value.hash)) {
    return value as unknown as ServerMessage;
  }
  if (type === 'desync' && isInteger(value.frame)) return value as unknown as ServerMessage;
  if (type === 'latency_pong' && typeof value.clientTime === 'number' && isInteger(value.serverTime)) {
    return value as unknown as ServerMessage;
  }
  if (type === 'room_closed' && stringField(value.reason)) return value as unknown as ServerMessage;
  if (type === 'error' && isRecord(value.error) && stringField(value.error.code) && stringField(value.error.message)) {
    return value as unknown as ServerMessage;
  }
  throw new Error(`Mensagem inválida do servidor: ${type}.`);
}
