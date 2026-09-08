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

describe('arenas do protocolo online', () => {
  const selection = (arenaId: string) => ({
    fighterId: 'rafa-mare', arenaId, clientBuildId: 'build', engineVersion: 'engine', assetRevision: 'assets',
  });
  const start = (arenaId: string, otherArena = arenaId, otherSlot = 'p2') => ({
    protocolVersion: 1, type: 'start', slot: 'p1', seed: 1, startAt: 2, inputDelay: 8,
    players: [
      { slot: 'p1', fighterId: 'rafa-mare', arenaId },
      { slot: otherSlot, fighterId: 'dante-sinal', arenaId: otherArena },
    ],
  });
  it.each(['cais-da-cidade', 'cozinha-macabra', 'sitio'])('aceita %s em seleção, sala e início', arenaId => {
    for (const message of [
      { protocolVersion: 1, type: 'selection_ack', selection: selection(arenaId) },
      { protocolVersion: 1, type: 'selection', slot: 'p1', selection: selection(arenaId) },
      { protocolVersion: 1, type: 'room_state', state: { roomCode: 'ABCDE23456', phase: 'ready', players: [
        { slot: 'p1', connected: true, selected: true, ready: false, fighterId: 'rafa-mare', arenaId },
      ] } },
      start(arenaId),
    ]) expect(parseServerMessage(JSON.stringify(message))).toMatchObject(message);
  });
  it('rejeita arena desconhecida, arenas divergentes e slots duplicados no início', () => {
    for (const message of [
      { protocolVersion: 1, type: 'selection_ack', selection: selection('inexistente') },
      start('inexistente'), start('cais-da-cidade', 'cozinha-macabra'),
      start('cozinha-macabra', 'cozinha-macabra', 'p1'),
    ]) expect(() => parseServerMessage(JSON.stringify(message))).toThrow();
  });
});
