import { expect, test, type Page, type TestInfo } from '@playwright/test';

type PauseAction = 'continue' | 'character-select' | 'main-menu';

interface PauseDebugState {
  readonly paused: boolean;
  readonly selectedAction: PauseAction;
}

interface FightState {
  readonly fighters: readonly {
    readonly health: number;
    readonly energy: number;
    readonly x: number;
    readonly y: number;
  }[];
  readonly round: number;
}

async function activeScenes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_SCENE_DEBUG__?: () => readonly string[];
    }).__RUA_SCENE_DEBUG__;
    return debug?.() ?? [];
  });
}

async function pauseState(page: Page): Promise<PauseDebugState | null> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __RUA_PAUSE_DEBUG__?: () => PauseDebugState;
    }).__RUA_PAUSE_DEBUG__;
    return debug?.() ?? null;
  });
}

async function fightState(page: Page): Promise<FightState | null> {
  return page.evaluate(() => {
    const world = (window as typeof window & {
      __ruaWorld?: { snapshot: () => FightState };
    }).__ruaWorld;
    if (!world) return null;
    const snapshot = world.snapshot();
    return {
      round: snapshot.round,
      fighters: snapshot.fighters.map(({ health, energy, x, y }) => ({ health, energy, x, y })),
    };
  });
}

async function requestedTrack(page: Page): Promise<string | null | undefined> {
  return page.evaluate(() => (window as typeof window & {
    __RUA_AUDIO_DEBUG__?: () => { requestedTrack: string | null };
  }).__RUA_AUDIO_DEBUG__?.().requestedTrack);
}

async function sessionState(page: Page): Promise<{ mode: string; hasResult: boolean } | null> {
  return page.evaluate(() => (window as typeof window & {
    __RUA_SESSION_DEBUG__?: () => { mode: string; hasResult: boolean };
  }).__RUA_SESSION_DEBUG__?.() ?? null);
}

async function tapInternal(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas sem dimensões para o toque.');
  await page.touchscreen.tap(
    box.x + x / 640 * box.width,
    box.y + y / 360 * box.height,
  );
}

async function waitForScene(page: Page, scene: string): Promise<void> {
  await expect.poll(() => activeScenes(page)).toContain(scene);
}

async function openTrainingFight(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto('/');
  await waitForScene(page, 'StartScene');
  if (testInfo.project.name === 'chrome-mobile-landscape') {
    await tapInternal(page, 320, 180);
  } else {
    await page.keyboard.press('Enter');
  }
  await waitForScene(page, 'MainMenuScene');

  await page.keyboard.press('KeyS');
  await page.waitForTimeout(70);
  await page.keyboard.press('KeyS');
  await page.waitForTimeout(70);
  await page.keyboard.press('Enter');
  await waitForScene(page, 'CharacterSelectScene');

  await page.keyboard.press('Enter');
  await page.waitForTimeout(220);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await waitForScene(page, 'FightScene');
}

test('teclado navega, continua e volta para a seleção sem passar pela StartScene', async ({ page }, testInfo) => {
  await openTrainingFight(page, testInfo);
  await page.keyboard.press('Escape');
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });

  await page.keyboard.press('KeyD');
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'character-select' });
  await page.keyboard.press('KeyA');
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });
  const stateBeforeContinue = await fightState(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => pauseState(page)).toEqual({ paused: false, selectedAction: 'continue' });
  expect(await fightState(page)).toEqual(stateBeforeContinue);

  await page.keyboard.press('Escape');
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });
  await page.keyboard.press('KeyD');
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'character-select' });
  await page.keyboard.press('Enter');
  await waitForScene(page, 'CharacterSelectScene');
  expect(await activeScenes(page)).not.toContain('FightScene');
  expect(await activeScenes(page)).not.toContain('StartScene');
  await expect.poll(() => sessionState(page)).toEqual({ mode: 'training', hasResult: false });
  await expect.poll(() => requestedTrack(page)).toBe('character-select');
});

test('botões touch continuam e retornam ao menu principal com uma única ação', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome-mobile-landscape', 'Fluxo exclusivo do projeto mobile touch.');
  await openTrainingFight(page, testInfo);

  await tapInternal(page, 320, 55);
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });
  await tapInternal(page, 84, 295);
  await expect.poll(() => pauseState(page)).toEqual({ paused: false, selectedAction: 'continue' });

  await tapInternal(page, 320, 55);
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });
  await tapInternal(page, 548, 295);
  await waitForScene(page, 'MainMenuScene');
  expect(await activeScenes(page)).not.toContain('FightScene');
  expect(await activeScenes(page)).not.toContain('StartScene');
  await expect.poll(() => sessionState(page)).toEqual({ mode: 'training', hasResult: false });
  await expect.poll(() => requestedTrack(page)).toBe('main-menu');
});

test('botão touch de seleção encerra a luta e preserva o modo treino', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome-mobile-landscape', 'Fluxo exclusivo do projeto mobile touch.');
  await openTrainingFight(page, testInfo);

  await tapInternal(page, 320, 55);
  await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });
  await tapInternal(page, 320, 295);
  await waitForScene(page, 'CharacterSelectScene');
  expect(await activeScenes(page)).not.toContain('FightScene');
  expect(await activeScenes(page)).not.toContain('StartScene');
  await expect.poll(() => sessionState(page)).toEqual({ mode: 'training', hasResult: false });
  await expect.poll(() => requestedTrack(page)).toBe('character-select');
});
