import type { FighterId } from '../types/combat';
import { OnlineApiClient, OnlineApiError } from './ApiClient';
import {
  CLIENT_BUILD_ID,
  COMBAT_ENGINE_VERSION,
  FIGHTER_ASSET_REVISION,
  ONLINE_ARENA_ID,
  ONLINE_AVAILABLE,
  ONLINE_PROTOCOL_VERSION,
} from './config';
import {
  parseServerMessage,
  type AdmissionData,
  type PlayerSlot,
  type RoomPlayer,
  type RoomState,
  type ServerMessage,
  type StartMessage,
} from './protocol';

export type OnlineStatus =
  | 'idle'
  | 'connecting'
  | 'lobby'
  | 'starting'
  | 'fighting'
  | 'reconnecting'
  | 'unavailable'
  | 'error';

export interface OnlineSnapshot {
  readonly available: boolean;
  readonly status: OnlineStatus;
  readonly message: string;
  readonly roomCode: string | null;
  readonly slot: PlayerSlot | null;
  readonly room: RoomState | null;
  readonly start: StartMessage | null;
  readonly latencyMs: number | null;
  readonly reconnectCount: number;
}

type SnapshotListener = (snapshot: OnlineSnapshot) => void;
type GameMessageListener = (message: ServerMessage) => void;

const friendlyErrors: Readonly<Record<string, string>> = {
  invalid_room_code: 'Código de sala inválido.',
  room_not_found: 'Sala não encontrada.',
  room_full: 'A sala já está cheia.',
  room_closed: 'A sala foi encerrada.',
  match_in_progress: 'A luta desta sala já começou.',
  client_version_mismatch: 'As versões dos dois jogadores são incompatíveis.',
  reconnect_expired: 'O prazo de reconexão expirou.',
  rate_limited: 'Muitas tentativas. Aguarde um instante.',
  network_error: 'Servidor inacessível. Verifique sua conexão.',
};

function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/gu, '').slice(0, 10);
}

function updatePlayer(
  room: RoomState,
  slot: PlayerSlot,
  patch: Partial<RoomPlayer>,
): RoomState {
  const found = room.players.some((player) => player.slot === slot);
  const players = found
    ? room.players.map((player) => player.slot === slot ? { ...player, ...patch } : player)
    : [
        ...room.players,
        {
          slot,
          connected: false,
          selected: false,
          ready: false,
          fighterId: null,
          arenaId: null,
          ...patch,
        },
      ];
  return { ...room, players };
}

export class OnlineSession {
  private readonly api = new OnlineApiClient();
  private socket: WebSocket | null = null;
  private intentionalClose = false;
  private pingTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private reconnectAttempt = 0;
  private snapshotListeners = new Set<SnapshotListener>();
  private gameListeners = new Set<GameMessageListener>();
  private state: OnlineSnapshot = {
    available: ONLINE_AVAILABLE,
    status: ONLINE_AVAILABLE ? 'idle' : 'unavailable',
    message: ONLINE_AVAILABLE ? 'Pronto para conectar.' : 'SERVIDOR ONLINE NAO CONFIGURADO',
    roomCode: null,
    slot: null,
    room: null,
    start: null,
    latencyMs: null,
    reconnectCount: 0,
  };

  get snapshot(): OnlineSnapshot {
    return this.state;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    listener(this.state);
    return () => this.snapshotListeners.delete(listener);
  }

  subscribeGame(listener: GameMessageListener): () => void {
    this.gameListeners.add(listener);
    return () => this.gameListeners.delete(listener);
  }

  async checkHealth(): Promise<boolean> {
    if (!ONLINE_AVAILABLE) return false;
    try {
      await this.api.health();
      return true;
    } catch {
      return false;
    }
  }

  reportHealth(healthy: boolean): void {
    if (!ONLINE_AVAILABLE) return;
    this.patch({
      status: healthy ? 'idle' : 'error',
      message: healthy ? 'Servidor online disponível.' : 'Servidor online indisponível. Tente novamente.',
    });
  }

  async createRoom(): Promise<void> {
    await this.admit(() => this.api.createRoom());
  }

  async joinRoom(rawCode: string): Promise<void> {
    const roomCode = normalizeRoomCode(rawCode);
    if (roomCode.length !== 10) {
      this.fail('Código deve ter 10 caracteres.');
      return;
    }
    await this.admit(() => this.api.joinRoom(roomCode));
  }

  selectFighter(fighterId: FighterId): void {
    this.send({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: 'select',
      fighterId,
      arenaId: ONLINE_ARENA_ID,
      clientBuildId: CLIENT_BUILD_ID,
      engineVersion: COMBAT_ENGINE_VERSION,
      assetRevision: FIGHTER_ASSET_REVISION,
    });
  }

  setReady(ready: boolean): void {
    this.send({ protocolVersion: ONLINE_PROTOCOL_VERSION, type: 'ready', ready });
  }

  sendInput(message: Record<string, unknown>): void {
    this.send(message);
  }

  sendStateHash(frame: number, hash: string): void {
    this.send({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: 'state_hash',
      frame,
      hash,
    });
  }

  markFightEntered(): void {
    if (this.state.start) this.patch({ status: 'fighting', message: 'Luta online ativa.' });
  }

  leave(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ protocolVersion: ONLINE_PROTOCOL_VERSION, type: 'leave' });
    }
    this.disconnectSocket();
    this.state = {
      available: ONLINE_AVAILABLE,
      status: ONLINE_AVAILABLE ? 'idle' : 'unavailable',
      message: ONLINE_AVAILABLE ? 'Pronto para conectar.' : 'SERVIDOR ONLINE NAO CONFIGURADO',
      roomCode: null,
      slot: null,
      room: null,
      start: null,
      latencyMs: null,
      reconnectCount: 0,
    };
    this.emit();
  }

  dismissError(): void {
    if (this.state.status !== 'error') return;
    this.patch({
      status: this.state.roomCode ? 'lobby' : 'idle',
      message: this.state.roomCode ? 'Conectado à sala.' : 'Pronto para conectar.',
    });
  }

  serverNow(): number {
    return Date.now() + (this.serverOffsetMs ?? 0);
  }

  /** Somente o gancho DEV chama este método para validar a reconexão real. */
  debugDropTransport(): boolean {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    // Fecha o transporte real sem marcar a saída como intencional. O evento de
    // close antigo fica sem autoridade; o mesmo fluxo normal de reconnect abre
    // um socket novo, enquanto o peer observa a janela de desconexão.
    this.socket = null;
    this.stopPings();
    socket.close(4000, 'Teste controlado de reconexão.');
    void this.handleUnexpectedClose();
    return true;
  }

  private serverOffsetMs: number | null = null;

  private async admit(operation: () => Promise<AdmissionData>): Promise<void> {
    if (!ONLINE_AVAILABLE || this.state.status === 'connecting') return;
    this.patch({ status: 'connecting', message: 'Conectando ao servidor...' });
    try {
      const admission = await operation();
      await this.connect(admission);
    } catch (error) {
      this.fail(this.errorMessage(error));
    }
  }

  private connect(admission: AdmissionData): Promise<void> {
    this.disconnectSocket();
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(admission.websocketUrl, [...admission.websocketProtocols]);
      this.socket = socket;
      const timeout = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error('Tempo de conexão esgotado.'));
      }, 8_000);
      socket.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        const reconnected = this.state.status === 'reconnecting';
        this.reconnectAttempt = 0;
        this.patch({
          status: 'lobby',
          message: 'Conectado à sala.',
          roomCode: admission.roomCode,
          slot: admission.slot,
          reconnectCount: this.state.reconnectCount + (reconnected ? 1 : 0),
        });
        this.startPings();
        resolve();
      }, { once: true });
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          this.fail('Servidor enviou dados incompatíveis.');
          socket.close(4002, 'Mensagem incompatível.');
          return;
        }
        try {
          this.handleMessage(parseServerMessage(event.data));
        } catch {
          this.fail('Servidor enviou mensagem incompatível.');
          socket.close(4002, 'Mensagem incompatível.');
        }
      });
      socket.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          globalThis.clearTimeout(timeout);
          reject(new Error('Falha ao abrir o canal da sala.'));
        }
      });
      socket.addEventListener('close', () => {
        globalThis.clearTimeout(timeout);
        const wasCurrent = this.socket === socket;
        if (wasCurrent) {
          this.socket = null;
          this.stopPings();
        }
        if (wasCurrent && !this.intentionalClose) void this.handleUnexpectedClose();
      });
    });
  }

  private handleMessage(message: ServerMessage): void {
    if (message.type === 'welcome') {
      this.serverOffsetMs = message.serverTime - Date.now();
    } else if (message.type === 'room_state') {
      this.patch({ room: message.state });
    } else if (message.type === 'peer_joined' || message.type === 'peer_connected') {
      if (this.state.room) this.patch({ room: updatePlayer(this.state.room, message.slot, { connected: true }) });
    } else if (message.type === 'peer_disconnected') {
      if (this.state.room) this.patch({ room: updatePlayer(this.state.room, message.slot, { connected: false, ready: false }) });
      if (this.state.status === 'fighting' && message.slot !== this.state.slot) {
        this.patch({
          status: 'error',
          message: 'O rival desconectou; sem backlog comprovado, a luta foi encerrada sem resultado.',
        });
      }
    } else if (message.type === 'player_removed') {
      if (this.state.room) this.patch({
        room: { ...this.state.room, players: this.state.room.players.filter((player) => player.slot !== message.slot) },
      });
    } else if (message.type === 'selection' || message.type === 'selection_ack') {
      const slot = message.type === 'selection' ? message.slot : this.state.slot;
      if (slot && this.state.room) {
        this.patch({
          room: updatePlayer(this.state.room, slot, {
            selected: true,
            ready: false,
            fighterId: message.selection.fighterId,
            arenaId: message.selection.arenaId,
          }),
        });
      }
    } else if (message.type === 'ready') {
      if (this.state.room) this.patch({ room: updatePlayer(this.state.room, message.slot, { ready: message.ready }) });
    } else if (message.type === 'start') {
      this.patch({ start: message, status: 'starting', message: 'Sincronizando início da luta...' });
    } else if (message.type === 'latency_pong') {
      const roundTrip = Math.max(0, Date.now() - message.clientTime);
      this.serverOffsetMs = message.serverTime + roundTrip / 2 - Date.now();
      this.patch({ latencyMs: Math.round(roundTrip) });
    } else if (message.type === 'error') {
      this.fail(friendlyErrors[message.error.code] ?? message.error.message);
    } else if (message.type === 'room_closed') {
      this.fail('A sala foi encerrada.');
    }
    for (const listener of this.gameListeners) listener(message);
  }

  private async handleUnexpectedClose(): Promise<void> {
    if (this.state.status === 'fighting' || this.state.status === 'starting') {
      this.patch({ status: 'error', message: 'Conexão perdida; a luta foi encerrada sem resultado.' });
      return;
    }
    if (!this.state.roomCode || this.reconnectAttempt >= 3) {
      this.fail('Não foi possível reconectar à sala.');
      return;
    }
    this.reconnectAttempt += 1;
    this.patch({ status: 'reconnecting', message: `Reconectando (${this.reconnectAttempt}/3)...` });
    const backoffMs = 350 * this.reconnectAttempt + Math.floor(Math.random() * 151);
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, backoffMs);
    });
    try {
      const admission = await this.api.reconnectRoom(this.state.roomCode);
      await this.connect(admission);
    } catch (error) {
      if (this.reconnectAttempt < 3) {
        await this.handleUnexpectedClose();
      } else {
        this.fail(this.errorMessage(error));
      }
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private startPings(): void {
    this.stopPings();
    const ping = (): void => this.send({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: 'latency_ping',
      clientTime: Date.now(),
    });
    ping();
    this.pingTimer = globalThis.setInterval(ping, 3_000);
  }

  private stopPings(): void {
    if (this.pingTimer !== null) globalThis.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private disconnectSocket(): void {
    this.intentionalClose = true;
    this.stopPings();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Saída local.');
  }

  private fail(message: string): void {
    this.patch({ status: 'error', message });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof OnlineApiError) return friendlyErrors[error.code] ?? error.message;
    return error instanceof Error ? error.message : 'Falha online inesperada.';
  }

  private patch(patch: Partial<OnlineSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.snapshotListeners) listener(this.state);
  }
}

export const onlineSession = new OnlineSession();
