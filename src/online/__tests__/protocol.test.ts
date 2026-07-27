import { parseServerMessage } from '../protocol';

describe('parser do protocolo online', () => {
  it('aceita room_state com seleção explícita por slot', () => {
    expect(parseServerMessage(JSON.stringify({
      protocolVersion: 1,
      type: 'room_state',
      state: {
        roomCode: 'ABCDE23456',
        phase: 'waiting',
        players: [{
          slot: 'p1',
          connected: true,
          selected: true,
          ready: false,
          fighterId: 'dante-sinal',
          arenaId: 'cais-da-cidade',
        }],
      },
    }))).toMatchObject({
      type: 'room_state',
      state: {
        players: [{ slot: 'p1', fighterId: 'dante-sinal' }],
      },
    });
  });

  it('recusa tipo desconhecido, roster bloqueado e input delay fora do contrato', () => {
    expect(() => parseServerMessage(JSON.stringify({
      protocolVersion: 1,
      type: 'future_message',
    }))).toThrow(/Mensagem inválida/u);
    expect(() => parseServerMessage(JSON.stringify({
      protocolVersion: 1,
      type: 'selection_ack',
      selection: {
        fighterId: 'mestre-calado',
        arenaId: 'cais-da-cidade',
        clientBuildId: 'build',
        engineVersion: 'engine',
        assetRevision: 'assets',
      },
    }))).toThrow(/selection_ack/u);
    expect(() => parseServerMessage(JSON.stringify({
      protocolVersion: 1,
      type: 'start',
      slot: 'p1',
      seed: 1,
      startAt: 2,
      inputDelay: 13,
      players: [],
    }))).toThrow(/start/u);
  });
});
