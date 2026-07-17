import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test';

interface FighterDebugState {
  readonly fighterIds: readonly string[];
  readonly bodySprites: readonly {
    readonly name: string;
    readonly texture: string;
    readonly visible: boolean;
    readonly active: boolean;
  }[];
}

interface PauseDebugState {
  readonly paused: boolean;
  readonly selectedAction: string;
}

async function activeScenes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (window as typeof window & {
    __RUA_SCENE_DEBUG__?: () => readonly string[];
  }).__RUA_SCENE_DEBUG__?.() ?? []);
}

async function fighterState(page: Page): Promise<FighterDebugState | null> {
  return page.evaluate(() => (window as typeof window & {
    __RUA_FIGHTER_DEBUG__?: () => FighterDebugState;
  }).__RUA_FIGHTER_DEBUG__?.() ?? null);
}

async function pauseState(page: Page): Promise<PauseDebugState | null> {
  return page.evaluate(() => (window as typeof window & {
    __RUA_PAUSE_DEBUG__?: () => PauseDebugState;
  }).__RUA_PAUSE_DEBUG__?.() ?? null);
}

async function waitForScene(page: Page, scene: string): Promise<void> {
  await expect.poll(() => activeScenes(page)).toContain(scene);
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

async function pressAndSettle(page: Page, key: string, delay = 70): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(delay);
}

async function openAstroFight(page: Page, testInfo: TestInfo): Promise<void> {
  const mobile = testInfo.project.name === 'chrome-mobile-landscape';
  await waitForScene(page, 'StartScene');
  if (mobile) await tapInternal(page, 320, 180);
  else await page.keyboard.press('Enter');
  await waitForScene(page, 'MainMenuScene');

  if (mobile) {
    await tapInternal(page, 320, 196);
  } else {
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'Enter');
  }
  await waitForScene(page, 'CharacterSelectScene');

  if (mobile) {
    await tapInternal(page, 294, 116);
    await tapInternal(page, 294, 116);
    await page.waitForTimeout(200);
    await tapInternal(page, 294, 238);
    await tapInternal(page, 294, 238);
    await page.waitForTimeout(200);
    await tapInternal(page, 320, 306);
  } else {
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'Enter', 200);
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'Enter', 200);
    await page.waitForTimeout(200);
    await pressAndSettle(page, 'Enter');
  }
  await waitForScene(page, 'FightScene');
}

test('Astro está desbloqueado, luta com sprites válidos e retorna à seleção', async ({ page }, testInfo) => {
  const astroResponses: { status: number; url: string }[] = [];
  const consoleProblems: string[] = [];
  const pageErrors: string[] = [];
  page.on('response', (response: Response) => {
    if (/\/assets\/fighters\/astro-riso\/.*\.png(?:\?.*)?$/u.test(response.url())) {
      astroResponses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await openAstroFight(page, testInfo);

  await expect.poll(() => fighterState(page)).toMatchObject({
    fighterIds: ['astro-riso', 'guto-barba'],
  });
  const fighters = await fighterState(page);
  expect(fighters).not.toBeNull();
  expect(fighters!.bodySprites).toHaveLength(2);
  expect(new Set(fighters!.bodySprites.map(({ name }) => name)).size).toBe(2);
  expect(fighters!.bodySprites).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'astro-riso-fighter-sprite',
      visible: true,
      active: true,
    }),
  ]));
  expect(fighters!.bodySprites.find(({ name }) => name.startsWith('astro-riso'))?.texture)
    .toMatch(/^astro-riso-/u);

  await expect.poll(() => astroResponses.length).toBeGreaterThanOrEqual(38);
  expect(astroResponses.some(({ status }) => status === 404)).toBe(false);
  expect(astroResponses.every(({ status }) => status >= 200 && status < 300)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleProblems.filter((message) => /texture|404|astro-riso/iu.test(message))).toEqual([]);

  await page.waitForFunction(() => {
    const world = (window as typeof window & {
      __ruaWorld?: { snapshot: () => { phase: string } };
    }).__ruaWorld;
    return world?.snapshot().phase === 'active';
  });
  await testInfo.attach(`astro-riso-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  if (testInfo.project.name === 'chrome-mobile-landscape') {
    await tapInternal(page, 320, 55);
    await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });
    await tapInternal(page, 320, 295);
  } else {
    await page.keyboard.press('Escape');
    await expect.poll(() => pauseState(page)).toEqual({ paused: true, selectedAction: 'continue' });
    await page.keyboard.press('KeyD');
    await page.keyboard.press('Enter');
  }
  await waitForScene(page, 'CharacterSelectScene');
  expect(await activeScenes(page)).not.toContain('FightScene');
  expect(await activeScenes(page)).not.toContain('StartScene');
});
