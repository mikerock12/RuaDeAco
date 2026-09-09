import { describe, expect, it } from 'vitest';
import { CombatWorld } from '../CombatWorld';
import { rafaMare } from '../../fighters/rafaMare';
import type { InputAction, InputFrame } from '../../types/combat';
const input = (held: InputAction[] = [], pressed: InputAction[] = []): InputFrame => ({held: new Set(held), pressed: new Set(pressed), released: new Set()});
const empty = input();
describe('presentation identity in mirror matches', () => {
  for (const attacker of [0, 1] as const) for (const blocked of [false, true]) {
    it('identifies side ' + attacker + ' for ' + (blocked ? 'block' : 'hit'), () => {
      const world = new CombatWorld(rafaMare, rafaMare, 'training');
      for (let i = 0; i < 105; i++) world.step(empty, empty);
      for (let i = 0; i < 70; i++) world.step(input(['right']), empty);
      for (let i = 0; i < 4; i++) world.step(empty, empty);
      world.drainEvents();
      const defense = blocked ? input(['block']) : empty;
      const attack = input(['light'], ['light']);
      world.step(attacker === 0 ? attack : defense, attacker === 1 ? attack : defense);
      for (let i = 0; i < 24; i++) world.step(attacker === 0 ? empty : defense, attacker === 1 ? empty : defense);
      const event = world.drainEvents().find(e => e.type === (blocked ? 'blocked' : 'hit'));
      expect(event).toMatchObject({attacker: 'rafa-mare', defender: 'rafa-mare', attackerIndex: attacker, defenderIndex: attacker === 0 ? 1 : 0});
    });
  }
});
