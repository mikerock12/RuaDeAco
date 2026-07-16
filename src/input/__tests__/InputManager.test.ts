import { describe, expect, it } from 'vitest';
import { InputManager, keyboardActionsForPlayer } from '../InputManager';

describe('mapeamento de teclado por jogador', () => {
  it('mantém movimento e ataques do P1', () => {
    expect(keyboardActionsForPlayer(0, 'KeyS')).toEqual(['down']);
    expect(keyboardActionsForPlayer(0, 'KeyF')).toEqual(['light']);
    expect(keyboardActionsForPlayer(0, 'KeyG')).toEqual(['heavy']);
    expect(keyboardActionsForPlayer(0, 'KeyH')).toEqual(['special']);
    expect(keyboardActionsForPlayer(0, 'KeyR')).toEqual(['block']);
  });

  it('mantém movimento e ataques do P2', () => {
    expect(keyboardActionsForPlayer(1, 'ArrowDown')).toEqual(['down']);
    expect(keyboardActionsForPlayer(1, 'KeyJ')).toEqual(['light']);
    expect(keyboardActionsForPlayer(1, 'KeyK')).toEqual(['heavy']);
    expect(keyboardActionsForPlayer(1, 'KeyL')).toEqual(['special']);
    expect(keyboardActionsForPlayer(1, 'KeyU')).toEqual(['block']);
  });
});

describe('arestas de input touch', () => {
  it('preserva pointerdown mesmo se pointerup ocorrer antes do sample', () => {
    const manager = new InputManager();
    manager.setTouchAction('light', true);
    manager.setTouchAction('light', false);
    const frame = manager.sample(0);
    expect(frame.held.has('light')).toBe(false);
    expect(frame.pressed.has('light')).toBe(true);
    expect(frame.released.has('light')).toBe(true);
  });
});
