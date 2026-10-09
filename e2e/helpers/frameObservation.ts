import type { Page } from '@playwright/test';

/** Observa cada tick real: poses curtas não dependem da frequência do runner E2E. */
export async function observeCombatFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = window as typeof window & {
      __ruaWorld: { step: (...args: unknown[]) => void; snapshot: () => unknown };
      __E2E_COMBAT_FRAMES__?: unknown[];
      __E2E_OBSERVED_WORLD__?: unknown;
    };
    probe.__E2E_COMBAT_FRAMES__ = [];
    if (probe.__E2E_OBSERVED_WORLD__ === probe.__ruaWorld) return;
    const world = probe.__ruaWorld;
    const step = world.step.bind(world);
    world.step = (...args: unknown[]) => {
      step(...args);
      if ((probe.__E2E_COMBAT_FRAMES__?.length ?? 0) < 900) {
        probe.__E2E_COMBAT_FRAMES__?.push(world.snapshot());
      }
    };
    probe.__E2E_OBSERVED_WORLD__ = world;
  });
}

export async function observedCombatFrames<T>(page: Page): Promise<T[]> {
  return page.evaluate(() => (window as typeof window & {
    __E2E_COMBAT_FRAMES__?: T[];
  }).__E2E_COMBAT_FRAMES__ ?? []);
}
