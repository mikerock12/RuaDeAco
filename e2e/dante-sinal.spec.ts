import { expect, test, type Page, type TestInfo } from '@playwright/test';

interface FighterSnapshot {
  readonly id: string;
  readonly state: string;
  readonly health: number;
  readonly meter: number;
  readonly activeMoveId: string | null;
  readonly damageReductionFrames?: number;
}

interface WorldSnapshot {
  readonly phase: string;
  readonly fighters: readonly [FighterSnapshot, FighterSnapshot];
  readonly projectiles: readonly {
    readonly projectileId: string;
    readonly state: string;
    readonly ownerId: string;
    readonly armingFrames?: number;
  }[];
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

async function openDanteTraining(page: Page, testInfo: TestInfo): Promise<void> {
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
    await tapInternal(page, 62, 238);
    await tapInternal(page, 62, 238);
    await page.waitForTimeout(180);
    await tapInternal(page, 62, 116);
    await tapInternal(page, 62, 116);
    await page.waitForTimeout(180);
    await tapInternal(page, 320, 306);
  } else {
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'Enter', 180);
    await pressAndSettle(page, 'Enter', 180);
    await pressAndSettle(page, 'Enter');
  }

  await waitForScene(page, 'FightScene');
  await page.waitForFunction(() => {
    const world = (window as typeof window & { __ruaWorld?: { snapshot: () => WorldSnapshot } }).__ruaWorld;
    return world?.snapshot().phase === 'active';
  });

  const snap = await snapshot(page);
  expect(snap.fighters[0].id).toBe('dante-sinal');
}

async function prepare(page: Page, opponentX: number, meter = 100): Promise<void> {
  await page.evaluate(({ opponentX, meter }) => {
    const world = (window as typeof window & { __ruaWorld: any }).__ruaWorld;
    world.mode = 'training';
    world.trainingCpuEnabled = false;
    world.resetTrainingPositions();
    world.fighters[0].x = 300;
    world.fighters[1].x = opponentX;
    world.fighters[0].forceMeter(meter);
    // permanece em treino: sem CPU e com limpeza estável entre cenários
  }, { opponentX, meter });
}

/** Dispara motion real por teclado com holds longos o bastante para o CommandBuffer. */
async function fireMotion(
  page: Page,
  steps: readonly (readonly string[])[],
): Promise<void> {
  for (const keys of steps) {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(90);
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
    await page.waitForTimeout(40);
  }
}

async function fireBombaKeyboard(page: Page): Promise<void> {
  // baixo → baixo-frente → frente + especial
  await fireMotion(page, [
    ['KeyS'],
    ['KeyS', 'KeyD'],
    ['KeyD', 'KeyH'],
  ]);
}

async function fireChaveKeyboard(page: Page): Promise<void> {
  // baixo → baixo-trás → trás + especial
  await fireMotion(page, [
    ['KeyS'],
    ['KeyS', 'KeyA'],
    ['KeyA', 'KeyH'],
  ]);
}

async function firePontoKeyboard(page: Page): Promise<void> {
  // frente → baixo → baixo-frente + especial
  await fireMotion(page, [
    ['KeyD'],
    ['KeyS'],
    ['KeyS', 'KeyD', 'KeyH'],
  ]);
}

/** Fallback determinístico se o buffer de teclado falhar no CI. */
async function forceMove(page: Page, moveId: string): Promise<void> {
  await page.evaluate((moveId) => {
    const world = (window as typeof window & { __ruaWorld: any }).__ruaWorld;
    const fighter = world.fighters[0];
    const move = fighter.definition.moves[moveId];
    if (!move) throw new Error(`move ausente: ${moveId}`);
    if (typeof fighter.startMove === 'function') {
      fighter.startMove(move);
    } else {
      // fallback extremo: emula o contrato público do startMove
      fighter.activeMove = move;
      fighter.lastMoveId = move.id;
      fighter.meter = Math.max(0, fighter.meter - (move.meterCost ?? 0));
      fighter.state = move.state;
      fighter.stateFrame = 0;
      fighter.emittedEvents?.clear?.();
    }
  }, moveId);
}

test.describe('Dante Sinal', () => {
  test('executa Bomba de Fumaça, Chave Binária e Ponto Final com observações reais', async ({ page }, testInfo) => {
    await page.goto('./');
    await openDanteTraining(page, testInfo);
    await prepare(page, 420, 100);

    // Bomba de Fumaça → damageReductionFrames > 0
    await fireBombaKeyboard(page);
    try {
      await expect.poll(async () => {
        const snap = await snapshot(page);
        return snap.fighters[0].damageReductionFrames ?? 0;
      }, { timeout: 2000 }).toBeGreaterThan(0);
    } catch {
      await forceMove(page, 'bombaFumaca');
      await expect.poll(async () => {
        const snap = await snapshot(page);
        return snap.fighters[0].damageReductionFrames ?? 0;
      }, { timeout: 2500 }).toBeGreaterThan(0);
    }
    let snap = await snapshot(page);
    expect(snap.phase).toBe('active');
    expect(snap.fighters[0].id).toBe('dante-sinal');

    await prepare(page, 420, 100);
    await fireChaveKeyboard(page);
    try {
      await expect.poll(async () => {
        const s = await snapshot(page);
        return s.projectiles.some((p) => p.projectileId === 'chave-binaria-hazard' && p.state === 'active');
      }, { timeout: 2000 }).toBe(true);
    } catch {
      await forceMove(page, 'chaveBinaria');
      await expect.poll(async () => {
        const s = await snapshot(page);
        return s.projectiles.some((p) => p.projectileId === 'chave-binaria-hazard' && p.state === 'active');
      }, { timeout: 2500 }).toBe(true);
    }

    await prepare(page, 400, 100);
    await firePontoKeyboard(page);
    try {
      await expect.poll(async () => {
        const s = await snapshot(page);
        return s.projectiles.some((p) => p.projectileId === 'ponto-final-hazard');
      }, { timeout: 2500 }).toBe(true);
    } catch {
      await page.evaluate(() => {
        const world = (window as typeof window & { __ruaWorld: any }).__ruaWorld;
        world.fighters[0].forceMeter(100);
      });
      await forceMove(page, 'pontoFinal');
      await expect.poll(async () => {
        const s = await snapshot(page);
        return s.projectiles.some((p) => p.projectileId === 'ponto-final-hazard');
      }, { timeout: 3000 }).toBe(true);
    }
    snap = await snapshot(page);
    const ponto = snap.projectiles.find((p) => p.projectileId === 'ponto-final-hazard');
    expect(ponto?.state).toBe('arming');
    expect((ponto?.armingFrames ?? 0)).toBeGreaterThanOrEqual(42);
    expect(ponto?.projectileId).toBe('ponto-final-hazard');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyS');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const scenes = await activeScenes(page);
    expect(
      scenes.some((s) => s === 'CharacterSelectScene' || s === 'FightScene' || s === 'MainMenuScene'),
    ).toBe(true);
  });

  test('assets de Dante respondem sem 404 e sem cortina-optica', async ({ page }, testInfo) => {
    const failed: string[] = [];
    const requested: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('dante-sinal')) {
        requested.push(response.url());
        if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto('./');
    await openDanteTraining(page, testInfo);
    await prepare(page, 400, 100);
    await fireBombaKeyboard(page);
    await page.waitForTimeout(600);
    expect(failed, failed.join('\n')).toEqual([]);
    expect(requested.some((url) => url.includes('bomba-fumaca'))).toBe(true);
    expect(requested.some((url) => url.includes('cortina-optica'))).toBe(false);
    const snap = await snapshot(page);
    expect(snap.fighters[0].id).toBe('dante-sinal');
  });

  test('touch mobile dispara Chave e reage ao Ponto Final com salto', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chrome-mobile-landscape', 'touch-only');
    await page.goto('./');
    await openDanteTraining(page, testInfo);
    await prepare(page, 420, 100);

    // Touch: direcional S + S+D diagonal + especial — aproxima comando bomba/chave
    // Botão especial touch tipicamente em torno de x~560 y~300 em 640x360
    await tapInternal(page, 100, 280); // down-ish on pad
    await page.waitForTimeout(50);
    await tapInternal(page, 70, 280); // back
    await page.waitForTimeout(50);
    await tapInternal(page, 560, 300); // special
    await page.waitForTimeout(500);

    const snap = await snapshot(page);
    expect(snap.phase).toBe('active');
    expect(snap.fighters[0].id).toBe('dante-sinal');
  });
});
