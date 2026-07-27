import type { InputAction, InputFrame } from '../../types/combat';
import {
  heldMask,
  inputFrameFromWire,
  isConsistentTransition,
  wireInputFrame,
} from '../inputCodec';

const input = (held: readonly InputAction[]): InputFrame => ({
  held: new Set(held),
  pressed: new Set(),
  released: new Set(),
});

describe('codec de input online', () => {
  it('mantém oito ações competitivas no bitmask', () => {
    expect(heldMask(input([
      'left', 'right', 'up', 'down', 'light', 'heavy', 'special', 'block',
    ]))).toBe(255);
    expect(heldMask(input(['pause', 'confirm', 'cancel']))).toBe(0);
  });

  it('deriva bordas apenas da transição de held', () => {
    const first = wireInputFrame(0, input(['right', 'light']), 0);
    const second = wireInputFrame(1, input(['right', 'block']), first.heldMask);
    expect(first).toEqual({ frame: 0, heldMask: 18, pressedMask: 18, releasedMask: 0 });
    expect(second).toEqual({ frame: 1, heldMask: 130, pressedMask: 128, releasedMask: 16 });
    expect(isConsistentTransition(second, first.heldMask)).toBe(true);
    expect([...inputFrameFromWire(second).pressed]).toEqual(['block']);
    expect([...inputFrameFromWire(second).released]).toEqual(['light']);
  });
});
