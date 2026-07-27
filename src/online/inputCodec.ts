import type { InputAction, InputFrame } from '../types/combat';
import type { WireInputFrame } from './protocol';

export const NETWORK_ACTIONS = [
  'left',
  'right',
  'up',
  'down',
  'light',
  'heavy',
  'special',
  'block',
] as const satisfies readonly InputAction[];

export function heldMask(input: InputFrame): number {
  let mask = 0;
  NETWORK_ACTIONS.forEach((action, index) => {
    if (input.held.has(action)) mask |= 1 << index;
  });
  return mask;
}

export function wireInputFrame(
  frame: number,
  input: InputFrame,
  previousHeldMask: number,
): WireInputFrame {
  const nextHeldMask = heldMask(input);
  return {
    frame,
    heldMask: nextHeldMask,
    pressedMask: nextHeldMask & ~previousHeldMask & 0xff,
    releasedMask: previousHeldMask & ~nextHeldMask & 0xff,
  };
}

function actionsFromMask(mask: number): Set<InputAction> {
  const actions = new Set<InputAction>();
  NETWORK_ACTIONS.forEach((action, index) => {
    if ((mask & (1 << index)) !== 0) actions.add(action);
  });
  return actions;
}

export function inputFrameFromWire(frame: WireInputFrame): InputFrame {
  return {
    held: actionsFromMask(frame.heldMask),
    pressed: actionsFromMask(frame.pressedMask),
    released: actionsFromMask(frame.releasedMask),
  };
}

export function isConsistentTransition(
  frame: WireInputFrame,
  previousHeldMask: number,
): boolean {
  return frame.pressedMask === (frame.heldMask & ~previousHeldMask & 0xff)
    && frame.releasedMask === (previousHeldMask & ~frame.heldMask & 0xff)
    && (frame.pressedMask & frame.releasedMask) === 0;
}
