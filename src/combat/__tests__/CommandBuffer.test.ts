import { describe, expect, it } from 'vitest';
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
  });
});
