import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

interface FighterSnapshot {
  readonly id: string;
  readonly state: string;
  readonly stateFrame: number;
  readonly health: number;
  readonly meter: number;
  readonly activeMoveId: string | null;
  readonly grabbedBy: string | null;
  readonly offensiveDebuffFrames: number;
  readonly parryFrames: number;
}

interface WorldSnapshot {
  readonly phase: string;
  readonly fighters: readonly [FighterSnapshot, FighterSnapshot];
  readonly projectiles: readonly {
    readonly projectileId: string;
    readonly ownerId: string;
  }[];
  readonly activeGrab: {
    readonly moveId: string;
    readonly attackerFrame: number;
  } | null;
  readonly lastDamage: number;
}

interface FighterDebugState {
  readonly fighterIds: readonly string[];
  readonly bodySprites: readonly {
    readonly name: string;
    readonly texture: string;
    readonly visible: boolean;
    readonly active: boolean;
  }[];
  readonly moveEffects: readonly {
    readonly name: string;
    readonly texture: string;
    readonly visible: boolean;
    readonly active: boolean;
  }[];
  readonly projectileSprites: readonly {
    readonly texture: string;
    readonly visible: boolean;
    readonly active: boolean;
    readonly x: number;
    readonly y: number;
  }[];
}

interface PauseDebugState {
  readonly paused: boolean;
  readonly selectedAction: string;
}

const CARD_POINTS = [
  [62, 116],
  [178, 116],
  [294, 116],
  [62, 238],
  [178, 238],
  [294, 238],
] as const;

const FIGHTER_INDEX = {
  'rafa-mare': 0,
  'noir-reflexo': 1,
  'astro-riso': 2,
  'dante-sinal': 3,
  'leo-violeta': 4,
  'guto-barba': 5,
} as const;

type FighterId = keyof typeof FIGHTER_INDEX;

const EVIDENCE_DIR = resolve(
  'tmp',
  'imagegen',
  'leo-violeta-noir-reflexo',
  'evidencias',
);

async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const fileName = `${name}-${testInfo.project.name}.png`;
  const body = await page.screenshot({ path: resolve(EVIDENCE_DIR, fileName) });
  await testInfo.attach(fileName, { body, contentType: 'image/png' });
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

async function moveCursorFromRafa(page: Page, fighterId: FighterId): Promise<void> {
  const index = FIGHTER_INDEX[fighterId];
  if (index >= 3) await pressAndSettle(page, 'KeyS');
  for (let column = 0; column < index % 3; column += 1) {
    await pressAndSettle(page, 'KeyD');
  }
}

async function selectFighter(
  page: Page,
  fighterId: FighterId,
  mobile: boolean,
): Promise<void> {
  if (mobile) {
    const point = CARD_POINTS[FIGHTER_INDEX[fighterId]];
    await tapInternal(page, point[0], point[1]);
    await page.waitForTimeout(50);
    await tapInternal(page, point[0], point[1]);
  } else {
    await moveCursorFromRafa(page, fighterId);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(190);
}

async function openTraining(
  page: Page,
  testInfo: TestInfo,
  playerOne: Exclude<FighterId, 'rafa-mare'>,
  opponent: FighterId,
): Promise<void> {
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

  await selectFighter(page, playerOne, mobile);
  await selectFighter(page, opponent, mobile);
  if (mobile) await tapInternal(page, 320, 306);
  else await page.keyboard.press('Enter');

  await waitForScene(page, 'FightScene');
  await page.waitForFunction(() => {
    const world = (window as typeof window & {
      __ruaWorld?: { snapshot(): WorldSnapshot };
    }).__ruaWorld;
    return world?.snapshot().phase === 'active';
  });
  expect((await snapshot(page)).fighters.map(({ id }) => id)).toEqual([playerOne, opponent]);
}

async function pauseCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as typeof window & {
      __RUA_CAPTURE_DEBUG__: { pause(): void };
    }).__RUA_CAPTURE_DEBUG__.pause();
  });
}

async function resumeCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as typeof window & {
      __RUA_CAPTURE_DEBUG__: { resume(): void };
    }).__RUA_CAPTURE_DEBUG__.resume();
  });
}

async function prepareDeterministic(
  page: Page,
  oneX: number,
  twoX: number,
  meter = 100,
): Promise<void> {
  await page.evaluate(({ oneX, twoX, meter }) => {
    const world = (window as typeof window & { __ruaWorld: any }).__ruaWorld;
    world.mode = 'training';
    world.trainingCpuEnabled = false;
    world.resetTrainingPositions();
    world.fighters[0].x = oneX;
    world.fighters[1].x = twoX;
    world.fighters[0].forceMeter(meter);
    world.fighters[1].forceMeter(meter);
    world.mode = 'versus';
  }, { oneX, twoX, meter });
}

async function stepUntil(
  page: Page,
  predicate: (state: WorldSnapshot) => boolean,
  limit = 180,
): Promise<WorldSnapshot> {
  for (let frame = 0; frame < limit; frame += 1) {
    const state = await snapshot(page);
    if (predicate(state)) return state;
    await page.evaluate(() => {
      (window as typeof window & {
        __RUA_CAPTURE_DEBUG__: { step(): void };
      }).__RUA_CAPTURE_DEBUG__.step();
    });
  }
  throw new Error(`Condição não alcançada após ${limit} frames determinísticos.`);
}

async function logicalStep(
  page: Page,
  held: readonly string[],
  pressed: readonly string[] = [],
  heldTwo: readonly string[] = [],
  pressedTwo: readonly string[] = [],
): Promise<void> {
  await page.evaluate(({ held, pressed, heldTwo, pressedTwo }) => {
    (window as typeof window & {
      __RUA_CAPTURE_DEBUG__: {
        step(
          held?: readonly string[],
          pressed?: readonly string[],
          heldTwo?: readonly string[],
          pressedTwo?: readonly string[],
        ): void;
      };
    }).__RUA_CAPTURE_DEBUG__.step(held, pressed, heldTwo, pressedTwo);
  }, { held, pressed, heldTwo, pressedTwo });
}

async function stepUntilWithInputs(
  page: Page,
  predicate: (state: WorldSnapshot) => boolean,
  held: readonly string[] = [],
  heldTwo: readonly string[] = [],
  limit = 180,
): Promise<WorldSnapshot> {
  for (let frame = 0; frame < limit; frame += 1) {
    const state = await snapshot(page);
    if (predicate(state)) return state;
    await logicalStep(page, held, [], heldTwo);
  }
  throw new Error(`Condição não alcançada após ${limit} frames com entradas determinísticas.`);
}

async function forceMove(page: Page, fighterIndex: 0 | 1, moveId: string): Promise<void> {
  await page.evaluate(({ fighterIndex, moveId }) => {
    const fighter = (window as typeof window & { __ruaWorld: any })
      .__ruaWorld.fighters[fighterIndex];
    const move = fighter.definition.moves[moveId];
    if (!move) throw new Error(`Golpe ausente: ${moveId}.`);
    fighter.startMove(move);
  }, { fighterIndex, moveId });
}

test.describe('Léo Violeta + Noir Reflexo', () => {
  test('seleciona ambos, acerta lows, carrega especiais e retorna à seleção', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const fighterResponses: { status: number; url: string }[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('response', (response: Response) => {
      if (/\/assets\/fighters\/(?:leo-violeta|noir-reflexo)\/.*\.png(?:\?.*)?$/u.test(response.url())) {
        fighterResponses.push({ status: response.status(), url: response.url() });
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await openTraining(page, testInfo, 'leo-violeta', 'noir-reflexo');
    const debug = await fighterDebug(page);
    expect(debug?.fighterIds).toEqual(['leo-violeta', 'noir-reflexo']);
    expect(debug?.bodySprites).toHaveLength(2);
    expect(new Set(debug?.bodySprites.map(({ name }) => name)).size).toBe(2);
    expect(debug?.bodySprites.every(({ texture }) => !texture.includes('__BASE'))).toBe(true);

    await pauseCapture(page);
    await prepareDeterministic(page, 300, 335);
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'leo-escala-idle');

    await prepareDeterministic(page, 260, 500);
    for (let frame = 0; frame < 4; frame += 1) await logicalStep(page, ['left']);
    expect((await snapshot(page)).fighters[0].state).toBe('walkBackward');
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'leo-escala-walk-backward');

    await prepareDeterministic(page, 260, 500);
    await logicalStep(page, ['down']);
    expect((await snapshot(page)).fighters[0].state).toBe('crouch');
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'leo-escala-crouch');

    await prepareDeterministic(page, 260, 500);
    await forceMove(page, 0, 'forwardLight');
    await stepUntil(page, (state) => state.fighters[0].stateFrame >= 7);
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'leo-escala-passo-pressao');

    await prepareDeterministic(page, 260, 500, 100);
    await forceMove(page, 0, 'pressaoVioleta');
    await stepUntil(page, (state) => state.fighters[0].stateFrame >= 27);
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'leo-escala-pressao-violeta');

    await prepareDeterministic(page, 300, 335);
    const healthBeforeLow = (await snapshot(page)).fighters[1].health;
    await logicalStep(page, ['down', 'light'], ['light']);
    await stepUntil(page, (state) => state.fighters[1].health < healthBeforeLow);
    expect((await snapshot(page)).fighters[0].activeMoveId).toBe('lowKick');

    await prepareDeterministic(page, 300, 338);
    const healthBeforeSweep = (await snapshot(page)).fighters[1].health;
    await logicalStep(page, ['down', 'heavy'], ['heavy']);
    await stepUntil(page, (state) => state.fighters[1].health < healthBeforeSweep);
    expect((await snapshot(page)).fighters[0].activeMoveId).toBe('sweep');

    await prepareDeterministic(page, 280, 430);
    await logicalStep(page, ['down']);
    await logicalStep(page, ['down', 'right']);
    await logicalStep(page, ['right', 'special'], ['special']);
    expect((await snapshot(page)).fighters[0].activeMoveId).toBe('olharFrio');
    const olharTravel = await stepUntil(
      page,
      (state) => state.projectiles.some(({ projectileId }) => projectileId === 'olharFrio'),
    );
    expect(olharTravel.projectiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectileId: 'olharFrio', ownerId: 'leo-violeta' }),
    ]));
    await page.waitForTimeout(60);
    expect((await fighterDebug(page))?.projectileSprites.some(
      ({ texture, visible }) => visible && texture.includes('olhar-frio'),
    )).toBe(true);
    await captureEvidence(page, testInfo, 'leo-olhar-frio-trajeto');
    const healthBeforeOlhar = olharTravel.fighters[1].health;
    const olharHit = await stepUntil(
      page,
      (state) => state.fighters[1].health < healthBeforeOlhar,
    );
    expect(healthBeforeOlhar - olharHit.fighters[1].health).toBe(40);
    expect(olharHit.projectiles.some(({ projectileId }) => projectileId === 'olharFrio'))
      .toBe(false);

    await prepareDeterministic(page, 280, 430);
    await forceMove(page, 0, 'olharFrio');
    const healthBeforeBlock = (await snapshot(page)).fighters[1].health;
    const olharBlocked = await stepUntilWithInputs(
      page,
      (state) => state.fighters[1].health < healthBeforeBlock,
      [],
      ['block'],
    );
    expect(healthBeforeBlock - olharBlocked.fighters[1].health).toBe(4);
    expect(olharBlocked.projectiles.some(({ projectileId }) => projectileId === 'olharFrio'))
      .toBe(false);
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'leo-olhar-frio-bloqueado');

    await prepareDeterministic(page, 280, 430);
    await forceMove(page, 0, 'olharFrio');
    const healthBeforeJump = (await snapshot(page)).fighters[1].health;
    for (let frame = 0; frame < 7; frame += 1) await logicalStep(page, []);
    await logicalStep(page, [], [], ['up'], ['up']);
    await stepUntil(
      page,
      (state) => state.projectiles.some(({ projectileId }) => projectileId === 'olharFrio'),
    );
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'leo-olhar-frio-pulado');
    await stepUntil(
      page,
      (state) => !state.projectiles.some(({ projectileId }) => projectileId === 'olharFrio'),
    );
    expect((await snapshot(page)).fighters[1].health).toBe(healthBeforeJump);

    await prepareDeterministic(page, 150, 500);
    await forceMove(page, 1, 'quebraLuz');
    const projectileState = await stepUntil(
      page,
      (state) => state.projectiles.some(({ projectileId }) => projectileId === 'quebraLuz'),
    );
    expect(projectileState.projectiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectileId: 'quebraLuz', ownerId: 'noir-reflexo' }),
    ]));

    await captureEvidence(page, testInfo, 'leo-noir-especiais');
    await resumeCapture(page);

    await expect.poll(() => fighterResponses.length).toBeGreaterThanOrEqual(77);
    expect(fighterResponses.some(({ status }) => status === 404)).toBe(false);
    expect(fighterResponses.every(({ status }) => status >= 200 && status < 300)).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((message) => /texture|__BASE|404|missing/iu.test(message))).toEqual([]);

    if (testInfo.project.name === 'chrome-mobile-landscape') {
      await tapInternal(page, 320, 55);
      await expect.poll(() => pauseDebug(page)).toEqual({
        paused: true,
        selectedAction: 'continue',
      });
      await tapInternal(page, 320, 295);
    } else {
      await page.keyboard.press('Escape');
      await expect.poll(() => pauseDebug(page)).toEqual({
        paused: true,
        selectedAction: 'continue',
      });
      await page.keyboard.press('KeyD');
      await expect.poll(async () => (await pauseDebug(page))?.selectedAction)
        .toBe('character-select');
      await page.keyboard.press('Enter');
    }
    await waitForScene(page, 'CharacterSelectScene');
    expect(await activeScenes(page)).not.toContain('FightScene');
  });

  test('captura transições de escala e o chute aéreo completo de Noir', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await openTraining(page, testInfo, 'noir-reflexo', 'leo-violeta');
    await pauseCapture(page);

    await prepareDeterministic(page, 260, 500);
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'noir-escala-idle');

    for (let frame = 0; frame < 4; frame += 1) await logicalStep(page, ['right']);
    expect((await snapshot(page)).fighters[0].state).toBe('walkForward');
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'noir-escala-corrida');

    await prepareDeterministic(page, 260, 500);
    for (let frame = 0; frame < 4; frame += 1) await logicalStep(page, ['left']);
    expect((await snapshot(page)).fighters[0].state).toBe('walkBackward');
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'noir-escala-walk-backward');

    await prepareDeterministic(page, 260, 500);
    await logicalStep(page, ['down']);
    expect((await snapshot(page)).fighters[0].state).toBe('crouch');
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'noir-escala-crouch');

    await prepareDeterministic(page, 260, 500);
    await forceMove(page, 0, 'forwardHeavy');
    await stepUntil(page, (state) => state.fighters[0].stateFrame >= 12);
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'noir-escala-arco-refletido');

    await prepareDeterministic(page, 260, 500);
    await logicalStep(page, ['up', 'right'], ['up']);
    await forceMove(page, 0, 'jumpHeavyForward');
    await stepUntil(page, (state) => state.fighters[0].stateFrame >= 10);
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'noir-chute-aereo-frente');
    await stepUntil(page, (state) => state.fighters[0].state === 'idle');
    await page.waitForTimeout(60);
    await captureEvidence(page, testInfo, 'noir-pos-aterrissagem');

    await resumeCapture(page);
  });

  for (const victimId of ['leo-violeta', 'noir-reflexo'] as const) {
    test(`Guto agarra, levanta, congela e arremessa ${victimId} como sprite separado`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(60_000);
      await page.goto('/');
      await openTraining(page, testInfo, 'guto-barba', victimId);
      await pauseCapture(page);
      await prepareDeterministic(page, 300, 350);

      await logicalStep(page, ['right', 'special'], ['special']);
      const victimStates = new Set<string>();
      await stepUntil(page, (state) => {
        victimStates.add(state.fighters[1].state);
        return state.activeGrab?.moveId === 'ganchoUrso'
          && state.activeGrab.attackerFrame >= 26;
      });
      await captureEvidence(page, testInfo, `guto-${victimId}-levantamento`);
      await stepUntil(page, (state) => {
        victimStates.add(state.fighters[1].state);
        return state.fighters[1].state === 'thrown';
      });
      expect(victimStates).toContain('grabbedFront');
      expect(victimStates).toContain('grabbedLifted');

      await prepareDeterministic(page, 300, 360, 100);
      await logicalStep(page, ['down', 'special'], ['special']);
      const frozen = await stepUntil(
        page,
        (state) => state.fighters[1].state === 'frozen'
          && state.activeGrab?.moveId === 'abracoGlacial'
          && state.activeGrab.attackerFrame >= 60,
      );
      expect(frozen.activeGrab?.moveId).toBe('abracoGlacial');
      expect(frozen.fighters[1].grabbedBy).toBe('guto-barba');
      await captureEvidence(page, testInfo, `guto-${victimId}-congelamento`);
      await stepUntil(page, (state) => state.fighters[1].state === 'thrown');

      const debug = await fighterDebug(page);
      expect(debug?.fighterIds).toEqual(['guto-barba', victimId]);
      expect(debug?.bodySprites).toHaveLength(2);
      expect(new Set(debug?.bodySprites.map(({ texture }) => texture) ?? []).size).toBe(2);
      await captureEvidence(page, testInfo, `guto-${victimId}-pos-arremesso`);
      await resumeCapture(page);
    });
  }
});
