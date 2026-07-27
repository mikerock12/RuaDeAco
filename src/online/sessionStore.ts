import type { SessionData } from './protocol';

const STORAGE_KEY = 'rua-de-aco.online-session.v1';

interface StoredSession {
  readonly sessionToken: string;
  readonly sessionId: string;
  readonly expiresAt: number;
  readonly protocolVersion: 1;
}

export function loadSession(now = Date.now()): SessionData | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof value.sessionToken !== 'string' || typeof value.sessionId !== 'string'
      || typeof value.expiresAt !== 'number' || value.protocolVersion !== 1
      || value.expiresAt <= now + 5_000) {
      clearSession();
      return null;
    }
    return value as SessionData;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: SessionData): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // O cliente continua apenas em memória quando storage está indisponível.
  }
}

export function clearSession(): void {
  try {
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Sem ação possível.
  }
}
