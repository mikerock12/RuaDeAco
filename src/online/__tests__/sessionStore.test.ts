import { clearSession, loadSession, saveSession } from '../sessionStore';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('persistência da sessão online', () => {
  it('persiste somente o contrato de sessão e remove valor expirado', () => {
    const storage = memoryStorage();
    vi.stubGlobal('sessionStorage', storage);
    saveSession({
      sessionToken: 'session-value',
      sessionId: 'session-id',
      expiresAt: 20_000,
      protocolVersion: 1,
    });
    expect(loadSession(1_000)).toEqual({
      sessionToken: 'session-value',
      sessionId: 'session-id',
      expiresAt: 20_000,
      protocolVersion: 1,
    });
    const raw = storage.getItem('rua-de-aco.online-session.v1') ?? '';
    expect(raw).not.toMatch(/socketTicket|websocketProtocols/iu);
    expect(loadSession(16_000)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('limpa JSON inválido sem lançar', () => {
    const storage = memoryStorage();
    vi.stubGlobal('sessionStorage', storage);
    storage.setItem('rua-de-aco.online-session.v1', '{');
    expect(loadSession()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });
});
