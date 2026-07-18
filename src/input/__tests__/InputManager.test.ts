import { describe, expect, it } from 'vitest';
import { InputManager, keyboardActionsForPlayer } from '../InputManager';
import { touchDpadActions } from '../touchDirection';

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

describe('união de fontes de entrada', () => {
  it('mantém a ação enquanto qualquer fonte a segurar', () => {
    const manager = new InputManager();
    manager.setSourceAction('keyboard', 0, 'left', true);
    manager.setSourceAction('gamepad', 0, 'left', true);
    let frame = manager.sample(0);
    expect(frame.held.has('left')).toBe(true);
    expect(frame.pressed.has('left')).toBe(true);

    // Soltar só o teclado não solta a ação segurada pelo gamepad.
    manager.setSourceAction('keyboard', 0, 'left', false);
    frame = manager.sample(0);
    expect(frame.held.has('left')).toBe(true);
    expect(frame.released.has('left')).toBe(false);

    manager.setSourceAction('gamepad', 0, 'left', false);
    frame = manager.sample(0);
    expect(frame.held.has('left')).toBe(false);
    expect(frame.released.has('left')).toBe(true);
  });

  it('não duplica a borda de pressed quando uma segunda fonte ativa a mesma ação', () => {
    const manager = new InputManager();
    manager.setSourceAction('keyboard', 0, 'light', true);
    manager.sample(0);
    manager.setSourceAction('touch', 0, 'light', true);
    const frame = manager.sample(0);
    expect(frame.held.has('light')).toBe(true);
    expect(frame.pressed.has('light')).toBe(false);
  });

  it('isola as fontes por jogador', () => {
    const manager = new InputManager();
    manager.setSourceAction('gamepad', 1, 'special', true);
    expect(manager.sample(0).held.has('special')).toBe(false);
    expect(manager.sample(1).held.has('special')).toBe(true);
  });

  it('limpa tudo com bordas de soltura ao perder o foco', () => {
    const manager = new InputManager();
    manager.setSourceAction('keyboard', 0, 'left', true);
    manager.setSourceAction('gamepad', 1, 'down', true);
    manager.sample(0);
    manager.sample(1);
    manager.clear();
    const one = manager.sample(0);
    const two = manager.sample(1);
    expect(one.held.size).toBe(0);
    expect(one.released.has('left')).toBe(true);
    expect(two.released.has('down')).toBe(true);
    // Depois da limpeza não sobra tecla presa.
    expect(manager.peekHeld(0, 'left')).toBe(false);
  });

  it('libera uma fonte inteira sem afetar as demais', () => {
    const manager = new InputManager();
    manager.setSourceAction('gamepad', 0, 'right', true);
    manager.setSourceAction('keyboard', 0, 'right', true);
    manager.sample(0);
    manager.releaseSource('gamepad', 0);
    const frame = manager.sample(0);
    expect(frame.held.has('right')).toBe(true);
    expect(frame.released.has('right')).toBe(false);
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

  it('produz baixo, diagonais e frente/trás durante o rolamento do direcional', () => {
    expect([...touchDpadActions(0, 0.75)]).toEqual(['down']);
    expect([...touchDpadActions(0.7, 0.7)]).toEqual(['right', 'down']);
    expect([...touchDpadActions(-0.7, 0.7)]).toEqual(['left', 'down']);
    expect([...touchDpadActions(0.75, 0)]).toEqual(['right']);
    expect([...touchDpadActions(-0.75, 0)]).toEqual(['left']);
  });
});
