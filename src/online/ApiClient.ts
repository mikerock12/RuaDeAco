import {
  MULTIPLAYER_BASE_URL,
  ONLINE_PROTOCOL_VERSION,
  ONLINE_SOCKET_PROTOCOL,
} from './config';
import type { AdmissionData, SessionData } from './protocol';
import { clearSession, loadSession, saveSession } from './sessionStore';
import { isSafeWebSocketEndpoint } from './url';

interface ApiEnvelope<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly code?: string; readonly message?: string };
}

export class OnlineApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OnlineApiError';
  }
}

function baseUrl(): string {
  if (MULTIPLAYER_BASE_URL === null) {
    throw new OnlineApiError(
      'online_unavailable',
      'Multiplayer indisponível nesta versão.',
      503,
    );
  }
  return MULTIPLAYER_BASE_URL;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  sessionToken?: string,
): Promise<T> {
  const method = init.method ?? 'POST';
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
  const abortFromCaller = (): void => controller.abort();
  init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (method !== 'GET') headers.set('Content-Type', 'application/json');
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      method,
      headers,
      ...(method === 'GET' ? {} : { body: init.body ?? '{}' }),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
  } catch {
    throw new OnlineApiError(
      controller.signal.aborted ? 'request_timeout' : 'network_error',
      controller.signal.aborted ? 'O servidor demorou demais para responder.' : 'Não foi possível alcançar o servidor.',
      0,
    );
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
  let envelope: ApiEnvelope<T>;
  try {
    envelope = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new OnlineApiError('invalid_response', 'Resposta inválida do servidor.', response.status);
  }
  if (!response.ok || envelope.ok !== true || envelope.data === undefined) {
    throw new OnlineApiError(
      envelope.error?.code ?? 'request_failed',
      envelope.error?.message ?? 'Falha no pedido online.',
      response.status,
    );
  }
  return envelope.data;
}

function validSession(value: SessionData): SessionData {
  if (value.protocolVersion !== ONLINE_PROTOCOL_VERSION
    || typeof value.sessionToken !== 'string'
    || typeof value.sessionId !== 'string'
    || !Number.isFinite(value.expiresAt)) {
    throw new OnlineApiError('protocol_mismatch', 'Sessão incompatível.', 502);
  }
  return value;
}

function validAdmission(value: AdmissionData): AdmissionData {
  if (!/^[A-HJ-NP-Z2-9]{10}$/u.test(value.roomCode)
    || (value.slot !== 'p1' && value.slot !== 'p2')
    || typeof value.socketTicket !== 'string' || value.socketTicket.length === 0
    || typeof value.websocketUrl !== 'string'
    || MULTIPLAYER_BASE_URL === null
    || !isSafeWebSocketEndpoint(value.websocketUrl, MULTIPLAYER_BASE_URL)
    || !Array.isArray(value.websocketProtocols)
    || value.websocketProtocols.length !== 2
    || value.websocketProtocols[0] !== ONLINE_SOCKET_PROTOCOL
    || value.websocketProtocols[1] !== `ticket.${value.socketTicket}`) {
    throw new OnlineApiError('invalid_response', 'Admissão de sala inválida.', 502);
  }
  return value;
}

export class OnlineApiClient {
  private session: SessionData | null = loadSession();

  async health(): Promise<void> {
    await request<Record<string, unknown>>('/health', { method: 'GET', body: null });
  }

  async ensureSession(): Promise<SessionData> {
    if (this.session && this.session.expiresAt > Date.now() + 5_000) return this.session;
    clearSession();
    this.session = validSession(await request<SessionData>('/v1/sessions'));
    saveSession(this.session);
    return this.session;
  }

  async createRoom(): Promise<AdmissionData> {
    const session = await this.ensureSession();
    try {
      return validAdmission(await request<AdmissionData>('/v1/rooms', {}, session.sessionToken));
    } catch (error) {
      if (error instanceof OnlineApiError && error.code === 'invalid_session') {
        this.invalidateSession();
      }
      throw error;
    }
  }

  async joinRoom(roomCode: string): Promise<AdmissionData> {
    const session = await this.ensureSession();
    return validAdmission(await request<AdmissionData>(
      `/v1/rooms/${encodeURIComponent(roomCode)}/join`,
      {},
      session.sessionToken,
    ));
  }

  async reconnectRoom(roomCode: string): Promise<AdmissionData> {
    const session = await this.ensureSession();
    return validAdmission(await request<AdmissionData>(
      `/v1/rooms/${encodeURIComponent(roomCode)}/reconnect`,
      {},
      session.sessionToken,
    ));
  }

  invalidateSession(): void {
    this.session = null;
    clearSession();
  }
}
