import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test';

interface FighterSnapshot {
  readonly id: string;
  readonly state: string;
  readonly stateFrame: number;
  readonly health: number;
  readonly meter: number;
  readonly activeMoveId: string | null;
  readonly grabbedBy: string | null;
  readonly victimPoseFrame: number | null;
  readonly victimPhaseFrame: number;
  readonly victimPhaseFrames: number;
}

interface WorldSnapshot {
  readonly phase: string;
  readonly fighters: readonly [FighterSnapshot, FighterSnapshot];
  readonly activeGrab: { readonly moveId: string; readonly attackerFrame: number } | null;
  readonly lastDamage: number;
}

interface FighterDebugState {
  readonly fighterIds: readonly string[];
  readonly bodySprites: readonly { name: string; texture: string; visible: boolean; active: boolean }[];
  readonly moveEffects: readonly { name: string; texture: string; visible: boolean; active: boolean }[];
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

async function snapshot(page: Page): Promise<WorldSnapshot> {
  return page.evaluate(() => (window as typeof window & {
    __ruaWorld: { snapshot: () => WorldSnapshot };
  }).__ruaWorld.snapshot());
}

async function fighterDebug(page: Page): Promise<FighterDebugState | null> {
  return page.evaluate(() => (window as typeof window & {
    __RUA_FIGHTER_DEBUG__?: () => FighterDebugState;
  }).__RUA_FIGHTER_DEBUG__?.() ?? null);
}

async function pauseDebug(page: Page): Promise<PauseDebugState | null> {
  return page.evaluate(() => (window as typeof window & {
    __RUA_PAUSE_DEBUG__?: () => PauseDebugState;
  }).__RUA_PAUSE_DEBUG__?.() ?? null);
}

async function waitForScene(page: Page, scene: string): Promise<void> {
  await expect.poll(() => activeScenes(page)).toContain(scene);
}

async function tapInternal(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas sem dimensões para toque.');
  await page.touchscreen.tap(box.x + x / 640 * box.width, box.y + y / 360 * box.height);
}

async function pressAndSettle(page: Page, key: string, delay = 90): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(delay);
}

async function openGutoTraining(page: Page, testInfo: TestInfo): Promise<void> {
  const mobile = testInfo.project.name === 'chrome-mobile-landscape';
  await waitForScene(page, 'StartScene');
  if (mobile) await tapInternal(page, 320, 180);
  else await page.keyboard.press('Enter');
  await waitForScene(page, 'MainMenuScene');

  if (mobile) await tapInternal(page, 320, 196);
  else {
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'Enter');
  }
  await waitForScene(page, 'CharacterSelectScene');

  if (mobile) {
    await tapInternal(page, 294, 238);
    await tapInternal(page, 294, 238);
    await page.waitForTimeout(180);
    await tapInternal(page, 62, 116);
    await tapInternal(page, 62, 116);
    await page.waitForTimeout(180);
    await tapInternal(page, 320, 306);
  } else {
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'Enter', 180);
    await pressAndSettle(page, 'Enter', 180);
    await pressAndSettle(page, 'Enter');
  }
  await waitForScene(page, 'FightScene');
  await page.waitForFunction(() => {
    const world = (window as typeof window & { __ruaWorld?: { snapshot: () => WorldSnapshot } }).__ruaWorld;
    return world?.snapshot().phase === 'active';
  });
}

async function prepare(page: Page, opponentX: number, meter = 100): Promise<void> {
  await page.evaluate(({ opponentX, meter }) => {
    const world = (window as typeof window & { __ruaWorld: any }).__ruaWorld;
    world.mode = 'training';
    world.resetTrainingPositions();
    world.fighters[0].x = 300;
    world.fighters[1].x = opponentX;
    world.fighters[0].forceMeter(meter);
    world.mode = 'versus';
  }, { opponentX, meter });
  await page.waitForTimeout(80);
}

async function pressChord(page: Page, direction: string, button: string): Promise<void> {
  await page.keyboard.down(direction);
  await page.keyboard.down(button);
  await page.waitForTimeout(55);
  await page.keyboard.up(button);
  await page.keyboard.up(direction);
}

async function pressGrabCommand(
  page: Page,
  direction: 'right' | 'down',
  mobile: boolean,
): Promise<void> {
  if (!mobile) {
    await pressChord(page, direction === 'right' ? 'KeyD' : 'KeyS', 'KeyH');
    return;
  }
  const directionBox = await page.locator(`[data-action="${direction}"]`).boundingBox();
  const specialBox = await page.locator('[data-action="special"]').boundingBox();
  if (!directionBox || !specialBox) throw new Error('Controles touch do agarrão não estão visíveis');

  const session = await page.context().newCDPSession(page);
  const touchPoints = [
    { x: directionBox.x + directionBox.width / 2, y: directionBox.y + directionBox.height / 2, id: 1 },
    { x: specialBox.x + specialBox.width / 2, y: specialBox.y + specialBox.height / 2, id: 2 },
  ];
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
    await page.waitForTimeout(55);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function captureMovePhases(
  page: Page,
  testInfo: TestInfo,
  moveId: 'ganchoUrso' | 'abracoGlacial',
  direction: 'right' | 'down',
  phases: readonly (readonly [string, number])[],
): Promise<void> {
  await page.evaluate(({ moveId, direction }) => {
    const debug = (window as typeof window & { __RUA_CAPTURE_DEBUG__: any }).__RUA_CAPTURE_DEBUG__;
    debug.pause();
    debug.step([direction, 'special'], ['special']);
    const activeMoveId = (window as typeof window & { __ruaWorld: any }).__ruaWorld
      .snapshot().fighters[0].activeMoveId;
    if (activeMoveId !== moveId) throw new Error(`Golpe esperado ${moveId}, recebido ${activeMoveId}.`);
  }, { moveId, direction });

  for (const [phase, target] of phases) {
    await page.evaluate((frame) => {
      const root = window as typeof window & { __RUA_CAPTURE_DEBUG__: any; __ruaWorld: any };
      let attempts = 0;
      while (root.__ruaWorld.snapshot().fighters[0].stateFrame < frame) {
        if (attempts++ > 900) throw new Error(`Frame determinístico ${frame} não alcançado.`);
        root.__RUA_CAPTURE_DEBUG__.step();
      }
    }, target);
    await page.waitForTimeout(30);
    await testInfo.attach(`${moveId}-${phase}-${testInfo.project.name}.png`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }
  await page.evaluate(() =>
    (window as typeof window & { __RUA_CAPTURE_DEBUG__: any }).__RUA_CAPTURE_DEBUG__.resume());
}

test('Guto executa Chute Pesado, Gancho e Abraço com sprites separados', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const mobile = testInfo.project.name === 'chrome-mobile-landscape';
  const gutoResponses: { status: number; url: string }[] = [];
  const consoleProblems: string[] = [];
  const pageErrors: string[] = [];
  page.on('response', (response: Response) => {
    if (/\/assets\/fighters\/guto-barba\/.*\.png(?:\?.*)?$/u.test(response.url())) {
      gutoResponses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await openGutoTraining(page, testInfo);
  const initialDebug = await fighterDebug(page);
  expect(initialDebug).not.toBeNull();
  expect(initialDebug?.fighterIds).toEqual(['guto-barba', 'rafa-mare']);
  expect(initialDebug?.bodySprites).toHaveLength(2);
  expect(new Set(initialDebug?.bodySprites.map(({ name }) => name))).toEqual(new Set([
    'guto-barba-fighter-sprite',
    'rafa-mare-fighter-sprite',
  ]));
  expect(initialDebug?.bodySprites.every(({ visible, active }) => visible && active)).toBe(true);
  if (testInfo.project.name === 'chrome-mobile-landscape') {
    await expect(page.locator('#touch-controls')).toHaveClass(/visible/u);
  }

  await prepare(page, 390);
  const healthBefore = (await snapshot(page)).fighters[1].health;
  await pressChord(page, 'KeyD', 'KeyG');
  await expect.poll(async () => (await snapshot(page)).fighters[0].activeMoveId).toBe('descendingBlow');
  await expect.poll(async () => (await snapshot(page)).lastDamage).toBe(138);
  await expect.poll(async () => (await snapshot(page)).fighters[1].health).toBe(healthBefore - 138);
  await testInfo.attach(`guto-heavy-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.waitForFunction(() => !(window as typeof window & { __ruaWorld: any }).__ruaWorld.fighters[0].currentMove);
  await prepare(page, 350);
  await pressGrabCommand(page, 'right', mobile);
  await expect.poll(async () => (await snapshot(page)).activeGrab?.moveId).toBe('ganchoUrso');
  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('grabbedFront');
  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('grabbedLifted');
  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('thrown');

  await page.waitForFunction(() => !(window as typeof window & { __ruaWorld: any }).__ruaWorld.fighters[0].currentMove);
  await prepare(page, 350);
  await captureMovePhases(page, testInfo, 'ganchoUrso', 'right', [
    ['contato', 10],
    ['sustentacao', 26],
    ['arremesso', 33],
  ]);
  await page.waitForFunction(() => !(window as typeof window & { __ruaWorld: any }).__ruaWorld.fighters[0].currentMove);
  await prepare(page, 365, 100);
  await pressGrabCommand(page, 'down', mobile);
  await expect.poll(async () => (await snapshot(page)).activeGrab?.moveId).toBe('abracoGlacial');
  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('grabbedFront');
  await testInfo.attach(`guto-abraco-hold-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const frozenDuration = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const world = (window as typeof window & { __ruaWorld: { snapshot: () => WorldSnapshot } }).__ruaWorld;
    let start = 0;
    let frames = 0;
    let attempts = 0;
    const tick = (now: number): void => {
      const state = world.snapshot().fighters[1].state;
      if (state === 'frozen') {
        if (start === 0) start = now;
        frames += 1;
      } else if (start > 0) {
        resolve(Math.max(now - start, frames * 1000 / 60));
        return;
      }
      if (attempts++ > 600) {
        reject(new Error('Abraço Glacial não concluiu a fase frozen.'));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  expect(frozenDuration).toBeGreaterThanOrEqual(700);
  expect((await snapshot(page)).fighters[1].grabbedBy).toBeNull();
  await testInfo.attach(`guto-grabs-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.waitForFunction(() => !(window as typeof window & { __ruaWorld: any }).__ruaWorld.fighters[0].currentMove);
  await prepare(page, 365, 100);
  await captureMovePhases(page, testInfo, 'abracoGlacial', 'down', [
    ['contato', 14],
    ['formacao', 31],
    ['congelamento', 60],
    ['rachaduras', 83],
    ['ruptura', 89],
  ]);
  await page.waitForFunction(() => !(window as typeof window & { __ruaWorld: any }).__ruaWorld.fighters[0].currentMove);

  const finalDebug = await fighterDebug(page);
  expect(finalDebug?.bodySprites).toHaveLength(2);
  expect(new Set(finalDebug?.bodySprites.map(({ name }) => name)).size).toBe(2);
  expect(finalDebug?.moveEffects.filter(({ visible }) => visible)).toEqual([]);
  await expect.poll(() => gutoResponses.length).toBeGreaterThanOrEqual(42);
  expect(gutoResponses.some(({ status }) => status === 404)).toBe(false);
  expect(gutoResponses.every(({ status }) => status >= 200 && status < 300)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleProblems.filter((message) => /texture|404|guto-barba/iu.test(message))).toEqual([]);

  if (testInfo.project.name === 'chrome-mobile-landscape') {
    await tapInternal(page, 320, 55);
    await expect.poll(() => pauseDebug(page)).toEqual({ paused: true, selectedAction: 'continue' });
    await tapInternal(page, 320, 295);
  } else {
    await page.keyboard.press('Escape');
    await expect.poll(() => pauseDebug(page)).toEqual({ paused: true, selectedAction: 'continue' });
    await page.keyboard.press('KeyD');
    await expect.poll(async () => (await pauseDebug(page))?.selectedAction).toBe('character-select');
    await page.keyboard.press('Enter');
  }
  await waitForScene(page, 'CharacterSelectScene');
  expect(await activeScenes(page)).not.toContain('FightScene');
});
