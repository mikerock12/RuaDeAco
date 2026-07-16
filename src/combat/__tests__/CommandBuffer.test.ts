import { describe, expect, it } from 'vitest';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import type { InputAction, InputCommand, InputFrame } from '../../types/combat';
import {
  CommandBuffer,
  directionFromInput,
  matchCommand,
  type ButtonSample,
  type DirectionSample,
} from '../CommandBuffer';

const frame = (held: readonly InputAction[], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});

const quarterCircle: InputCommand = {
  directions: ['down', 'downForward', 'forward'],
  buttons: ['special'],
  maxGapFrames: 5,
  bufferFrames: 7,
  priority: 30,
};

const validSamples: readonly DirectionSample[] = [
  { token: 'neutral', frame: 0 },
  { token: 'down', frame: 2 },
  { token: 'downForward', frame: 5 },
  { token: 'forward', frame: 8 },
];

describe('leitura de comandos', () => {
  it('reconhece quarto de lua e botão no prazo', () => {
    expect(matchCommand(quarterCircle, validSamples, frame(['special'], ['special']), 10)).toBe(true);
  });

  it('rejeita sequência expirada ou fora de ordem', () => {
    expect(matchCommand(quarterCircle, validSamples, frame(['special'], ['special']), 20)).toBe(false);
    const wrong: readonly DirectionSample[] = [
      { token: 'forward', frame: 2 },
      { token: 'downForward', frame: 5 },
      { token: 'down', frame: 8 },
    ];
    expect(matchCommand(quarterCircle, wrong, frame(['special'], ['special']), 10)).toBe(false);
  });

  it('rejeita botão pressionado antes de iniciar o movimento direcional', () => {
    const lateMotion: readonly DirectionSample[] = [
      { token: 'down', frame: 6 },
      { token: 'downForward', frame: 8 },
      { token: 'forward', frame: 10 },
    ];
    const earlyButton: readonly ButtonSample[] = [{ button: 'special', frame: 5 }];
    expect(matchCommand(quarterCircle, lateMotion, frame([]), 10, earlyButton)).toBe(false);
  });

  it('não dispara novamente quando o botão está apenas segurado', () => {
    expect(matchCommand(quarterCircle, validSamples, frame(['special']), 10)).toBe(false);
  });

  it('consome um botão pressionado durante a janela de buffer', () => {
    const buffer = new CommandBuffer();
    buffer.push(1, frame(['light'], ['light']), 1);
    buffer.push(2, frame([]), 1);
    const move = buffer.findMove({ lightPunch: rafaMare.moves.lightPunch! }, frame([]), 2, 0);
    expect(move?.id).toBe('lightPunch');
  });

  it('normaliza frente e diagonal para lutadores virados à esquerda', () => {
    expect(directionFromInput(frame(['left']), -1)).toBe('forward');
    expect(directionFromInput(frame(['down', 'left']), -1)).toBe('downForward');
    expect(directionFromInput(frame(['right']), -1)).toBe('back');
    expect(directionFromInput(frame(['down', 'right']), -1)).toBe('downBack');
    expect(directionFromInput(frame(['down', 'left']), 1)).toBe('downBack');
  });

  it('golpe de direção única "baixo" aceita a diagonal baixo-frente', () => {
    const lowCommand: InputCommand = {
      directions: ['down'],
      buttons: ['light'],
      maxGapFrames: 2,
      bufferFrames: 5,
      priority: 14,
    };
    const diagonalSamples: readonly DirectionSample[] = [{ token: 'downForward', frame: 3 }];
    expect(matchCommand(lowCommand, diagonalSamples, frame(['light'], ['light']), 3)).toBe(true);
    // Sequências continuam estritas: quarto de círculo não aceita atalhos.
    const sloppy: readonly DirectionSample[] = [
      { token: 'downForward', frame: 2 },
      { token: 'downForward', frame: 5 },
      { token: 'forward', frame: 8 },
    ];
    expect(matchCommand(quarterCircle, sloppy, frame(['special'], ['special']), 10)).toBe(false);
  });

  it('separa golpes aéreos dos terrestres no findMove', () => {
    const buffer = new CommandBuffer();
    buffer.push(1, frame(['light'], ['light']), 1);
    const moves = { lightPunch: rafaMare.moves.lightPunch!, jumpLightNeutral: rafaMare.moves.jumpLightNeutral! };
    expect(buffer.findMove(moves, frame(['light'], ['light']), 1, 0)?.id).toBe('lightPunch');
    expect(buffer.findMove(moves, frame(['light'], ['light']), 1, 0, true)?.id).toBe('jumpLightNeutral');
  });

  it('prioriza especiais simples neutro, frente e baixo', () => {
    const neutral = new CommandBuffer();
    neutral.push(1, frame(['special'], ['special']), 1);
    expect(neutral.findMove(rafaMare.moves, frame(['special'], ['special']), 1, 100)?.id)
      .toBe('maoDaMare');

    const forward = new CommandBuffer();
    forward.push(1, frame(['right', 'special'], ['special']), 1);
    expect(forward.findMove(rafaMare.moves, frame(['right', 'special'], ['special']), 1, 100)?.id)
      .toBe('chuteRessaca');

    const down = new CommandBuffer();
    down.push(1, frame(['down', 'special'], ['special']), 1);
    expect(down.findMove(rafaMare.moves, frame(['down', 'special'], ['special']), 1, 50)?.id)
      .toBe('ecoTatuado');
  });

  it('não cai no especial neutro quando falta energia para o direcional pretendido', () => {
    const rafa = new CommandBuffer();
    rafa.push(1, frame(['down', 'special'], ['special']), 1);
    expect(rafa.findMove(rafaMare.moves, frame(['down', 'special'], ['special']), 1, 0)).toBeNull();

    const guto = new CommandBuffer();
    guto.push(1, frame(['down', 'special'], ['special']), 1);
    expect(guto.findMove(gutoBarba.moves, frame(['down', 'special'], ['special']), 1, 0)).toBeNull();
  });
});
