import { describe, expect, it } from 'vitest';
import { InputManager } from '../InputManager';

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
