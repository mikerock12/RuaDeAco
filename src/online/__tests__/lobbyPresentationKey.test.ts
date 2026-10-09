import { describe, expect, it } from 'vitest';
import type { OnlineSnapshot } from '../OnlineSession';
import { lobbyPresentationKey } from '../lobbyPresentationKey';

const snapshot: OnlineSnapshot = {
  available: true, status: 'lobby', message: 'Conectado à sala.', roomCode: 'ABCDEFGHJK',
  slot: 'p1', start: null, latencyMs: 8, reconnectCount: 0,
  room: { roomCode: 'ABCDEFGHJK', phase: 'waiting', players: [
    { slot: 'p1', connected: true, selected: true, ready: false, fighterId: 'rafa-mare', arenaId: 'sitio' },
    { slot: 'p2', connected: true, selected: true, ready: false, fighterId: 'guto-barba', arenaId: 'sitio' },
  ] },
};

describe('estabilidade visual do lobby', () => {
  it('mantém os controles quando apenas o ping muda', () => {
    expect(lobbyPresentationKey({ ...snapshot, latencyMs: 120 })).toBe(lobbyPresentationKey(snapshot));
  });
  it('mantém os controles ao repetir o mesmo estado recebido pela rede', () => {
    expect(lobbyPresentationKey(structuredClone(snapshot))).toBe(lobbyPresentationKey(snapshot));
  });
  it('atualiza controles quando o adversário confirma pronto', () => {
    const next = structuredClone(snapshot);
    const room = { ...next.room!, players: next.room!.players.map(player => player.slot === 'p2' ? { ...player, ready: true } : player) };
    expect(lobbyPresentationKey({ ...next, room })).not.toBe(lobbyPresentationKey(snapshot));
  });
  it('atualiza controles quando muda a fase ou a conexão', () => {
    expect(lobbyPresentationKey({ ...snapshot, status: 'reconnecting' })).not.toBe(lobbyPresentationKey(snapshot));
    const room = { ...snapshot.room!, players: snapshot.room!.players.map(player => ({ ...player, arenaId: 'cozinha-macabra' as const })) };
    expect(lobbyPresentationKey({ ...snapshot, room })).not.toBe(lobbyPresentationKey(snapshot));
  });
});
