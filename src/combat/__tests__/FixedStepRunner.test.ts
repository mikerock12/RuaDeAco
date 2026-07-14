import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS } from '../../config/gameConfig';
import { FixedStepRunner } from '../FixedStepRunner';

describe('passo fixo', () => {
  it('executa a simulação em incrementos de 60 Hz', () => {
    const runner = new FixedStepRunner();
    let steps = 0;
    runner.update(FIXED_STEP_MS * 2, () => { steps += 1; });
    expect(steps).toBe(2);
  });

  it('não deixa alpha negativo quando é reiniciado dentro do passo', () => {
    const runner = new FixedStepRunner();
    runner.update(FIXED_STEP_MS, () => runner.reset());
    expect(runner.alpha).toBe(0);
  });
});
