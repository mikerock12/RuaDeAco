import { FIXED_STEP_MS, MAX_CATCH_UP_STEPS } from '../config/gameConfig';

export class FixedStepRunner {
  private accumulator = 0;

  update(deltaMs: number, step: () => void): number {
    this.accumulator += Math.min(deltaMs, FIXED_STEP_MS * MAX_CATCH_UP_STEPS);
    let steps = 0;
    while (this.accumulator >= FIXED_STEP_MS && steps < MAX_CATCH_UP_STEPS) {
      this.accumulator -= FIXED_STEP_MS;
      step();
      steps += 1;
    }
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }

  get alpha(): number {
    return this.accumulator / FIXED_STEP_MS;
  }
}
