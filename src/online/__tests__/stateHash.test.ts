import { CombatWorld } from '../../combat/CombatWorld';
import { FixedStepRunner } from '../../combat/FixedStepRunner';
import { FIXED_STEP_MS } from '../../config/gameConfig';
import { AVAILABLE_FIGHTERS } from '../../fighters';
import type { InputAction, InputFrame } from '../../types/combat';
import { combatStateHash, deterministicHash } from '../stateHash';

const frame = (held: readonly InputAction[], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});
const neutral = frame([]);

describe('estado determinístico do combate', () => {
  it('canonicaliza objetos independentemente da ordem de chaves', () => {
    expect(deterministicHash({ b: 2, a: 1 })).toBe(deterministicHash({ a: 1, b: 2 }));
  });

  it.each(AVAILABLE_FIGHTERS.flatMap((one) => (
    AVAILABLE_FIGHTERS.map((two) => [one, two] as const)
  )))('produz o mesmo hash em duas execuções de %s x %s', (one, two) => {
    const first = new CombatWorld(one, two, 'online');
    const second = new CombatWorld(one, two, 'online');
    for (let index = 0; index < 360; index += 1) {
      const oneInput = index % 90 === 0
        ? frame(['right', 'light'], ['right', 'light'])
        : index % 90 < 12 ? frame(['right']) : neutral;
      const twoInput = index % 120 === 0
        ? frame(['left', 'heavy'], ['left', 'heavy'])
        : index % 120 < 8 ? frame(['left']) : neutral;
      first.step(oneInput, twoInput);
      second.step(oneInput, twoInput);
      expect(combatStateHash(first)).toBe(combatStateHash(second));
    }
  });

  it('detecta divergência competitiva de um único input', () => {
    const [one, two] = AVAILABLE_FIGHTERS;
    if (!one || !two) throw new Error('Roster jogável incompleto.');
    const first = new CombatWorld(one, two, 'online');
    const second = new CombatWorld(one, two, 'online');
    for (let index = 0; index < 120; index += 1) {
      first.step(index === 110 ? frame(['right']) : neutral, neutral);
      second.step(neutral, neutral);
    }
    expect(combatStateHash(first)).not.toBe(combatStateHash(second));
  });

  it('independe da cadência de render quando os passos fixos são os mesmos', () => {
    const [one, two] = AVAILABLE_FIGHTERS;
    if (!one || !two) throw new Error('Roster jogável incompleto.');
    const fastRender = new CombatWorld(one, two, 'online');
    const slowRender = new CombatWorld(one, two, 'online');
    const fastRunner = new FixedStepRunner();
    const slowRunner = new FixedStepRunner();
    let fastFrame = 0;
    let slowFrame = 0;
    const simulate = (world: CombatWorld, index: number): void => {
      const p1 = index % 75 < 20 ? frame(['right']) : neutral;
      const p2 = index % 90 === 0 ? frame(['light'], ['light']) : neutral;
      world.step(p1, p2);
    };

    for (let render = 0; render < 360; render += 1) {
      fastRunner.update(FIXED_STEP_MS, () => simulate(fastRender, fastFrame++));
    }
    for (let render = 0; render < 180; render += 1) {
      slowRunner.update(FIXED_STEP_MS * 2, () => simulate(slowRender, slowFrame++));
    }

    expect(fastFrame).toBe(slowFrame);
    expect(combatStateHash(fastRender)).toBe(combatStateHash(slowRender));
  });
});
