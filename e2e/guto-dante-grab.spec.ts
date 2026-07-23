import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface FighterSnapshot {
  readonly id: string;
  readonly state: string;
  readonly stateFrame: number;
  readonly x: number;
  readonly health: number;
  readonly meter: number;
  readonly activeMoveId: string | null;
  readonly grabbedBy: string | null;
  readonly victimPoseFrame: number | null;
  readonly damageReductionFrames?: number;
}

interface WorldSnapshot {
  readonly phase: string;
  readonly frame: number;
  readonly fighters: readonly [FighterSnapshot, FighterSnapshot];
  readonly activeGrab: { readonly moveId: string; readonly attackerFrame: number } | null;
  readonly lastDamage: number;
}

const EVIDENCE_DIR = resolve(
  process.cwd(),
  'tmp/imagegen/dante-sinal/grok/bug-grab-freeze/evidencias',
);

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

async function openGutoVsDante(page: Page, testInfo: TestInfo): Promise<void> {
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
    // Guto (coluna direita, linha inferior) + Dante (coluna esquerda, linha inferior)
    await tapInternal(page, 294, 238);
    await tapInternal(page, 294, 238);
    await page.waitForTimeout(180);
    await tapInternal(page, 62, 238);
    await tapInternal(page, 62, 238);
    await page.waitForTimeout(180);
    await tapInternal(page, 320, 306);
  } else {
    // Grid 3x2: Rafa Noir Astro / Dante Leo Guto
    // P1 Guto: down, right, right
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'KeyD');
    await pressAndSettle(page, 'Enter', 180);
    // Após P1, cursor vai ao primeiro disponível ≠ Guto (Rafa). Down → Dante.
    await pressAndSettle(page, 'KeyS');
    await pressAndSettle(page, 'Enter', 180);
    await pressAndSettle(page, 'Enter');
  }

  await waitForScene(page, 'FightScene');
  await page.waitForFunction(() => {
    const world = (window as typeof window & { __ruaWorld?: { snapshot: () => WorldSnapshot } }).__ruaWorld;
    return world?.snapshot().phase === 'active';
  });

  const snap = await snapshot(page);
  expect(snap.fighters[0].id).toBe('guto-barba');
  expect(snap.fighters[1].id).toBe('dante-sinal');
}

async function prepare(
  page: Page,
  opponentX: number,
  options: { meter?: number; gutoFacing?: 1 | -1; bomba?: boolean } = {},
): Promise<void> {
  const { meter = 100, gutoFacing = 1, bomba = false } = options;
  await page.evaluate(({ opponentX, meter, gutoFacing, bomba }) => {
    const world = (window as typeof window & { __ruaWorld: any }).__ruaWorld;
    world.mode = 'training';
    world.trainingCpuEnabled = false;
    world.resetTrainingPositions();
    if (gutoFacing === 1) {
      // Guto esquerda, Dante à direita em opponentX
      world.fighters[0].x = 300;
      world.fighters[1].x = opponentX;
      world.fighters[0].facing = 1;
      world.fighters[1].facing = -1;
    } else {
      // Guto direita (X maior), Dante à esquerda — facing manual para o comando
      world.fighters[0].x = 360;
      world.fighters[1].x = 310;
      world.fighters[0].facing = -1;
      world.fighters[1].facing = 1;
    }
    world.fighters[0].forceMeter(meter);
    if (bomba) {
      world.fighters[1].damageReductionFrames = 120;
      world.fighters[1].damageReductionMultiplier = 0.7;
    }
    world.mode = 'versus';
  }, { opponentX, meter, gutoFacing, bomba });
  await page.waitForTimeout(50);
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
  direction: 'right' | 'left' | 'down',
  mobile: boolean,
): Promise<void> {
  if (!mobile) {
    const key = direction === 'right' ? 'KeyD' : direction === 'left' ? 'KeyA' : 'KeyS';
    await pressChord(page, key, 'KeyH');
    return;
  }
  const action = direction === 'left' ? 'left' : direction;
  const directionBox = await page.locator(`[data-action="${action}"]`).boundingBox();
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

async function saveEvidence(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const body = await page.screenshot();
  writeFileSync(resolve(EVIDENCE_DIR, `${name}.png`), body);
}

async function pollUntil(
  page: Page,
  predicate: (snap: WorldSnapshot) => boolean,
  label: string,
  timeoutMs = 12_000,
): Promise<WorldSnapshot> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const snap = await snapshot(page);
    if (predicate(snap)) return snap;
    await page.waitForTimeout(16);
  }
  throw new Error(`Timeout aguardando: ${label}`);
}

test('Guto agarra Dante: Gancho e Abraço sem pageerror além do frame 12', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const mobile = testInfo.project.name === 'chrome-mobile-landscape';
  const consoleProblems: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await openGutoVsDante(page, testInfo);

  // --- Gancho do Urso, Guto à esquerda ---
  await prepare(page, 350, { gutoFacing: 1 });
  await saveEvidence(page, `before-gancho-${testInfo.project.name}`);
  const healthBefore = (await snapshot(page)).fighters[1].health;
  const frameBefore = (await snapshot(page)).frame;
  await pressGrabCommand(page, 'right', mobile);

  await expect.poll(async () => (await snapshot(page)).activeGrab?.moveId).toBe('ganchoUrso');
  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('grabbedFront');

  // Chega além do frame 12 (pose 4) que travava com 4 frames
  const pastFreeze = await pollUntil(
    page,
    (snap) => {
      const attacker = snap.fighters[0];
      const victim = snap.fighters[1];
      return attacker.stateFrame >= 12
        && victim.state === 'grabbedFront'
        && (victim.victimPoseFrame ?? -1) >= 4;
    },
    'Gancho frame 12 / pose 4',
  );
  expect(pastFreeze.fighters[1].victimPoseFrame).toBeGreaterThanOrEqual(4);
  await saveEvidence(page, `gancho-pose4-${testInfo.project.name}`);

  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('grabbedLifted');
  const liftedHigh = await pollUntil(
    page,
    (snap) => (snap.fighters[1].victimPoseFrame ?? -1) >= 7
      && snap.fighters[1].state === 'grabbedLifted',
    'Gancho pose 7 lifted',
  );
  expect(liftedHigh.fighters[1].victimPoseFrame).toBe(7);
  await saveEvidence(page, `gancho-pose7-${testInfo.project.name}`);

  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('thrown');
  await pollUntil(
    page,
    (snap) => snap.activeGrab === null && snap.fighters[1].grabbedBy === null,
    'Gancho release',
  );
  await saveEvidence(page, `after-gancho-release-${testInfo.project.name}`);

  const afterGancho = await snapshot(page);
  expect(afterGancho.fighters[1].health).toBe(healthBefore - 155);
  expect(afterGancho.frame).toBeGreaterThan(frameBefore);
  expect(pageErrors.filter((m) => /Frame .* ausente/iu.test(m))).toEqual([]);
  expect(consoleProblems.filter((m) => /Frame .* ausente/iu.test(m))).toEqual([]);

  // Novo input aceito
  await pressChord(page, 'KeyD', 'KeyF');
  await expect.poll(async () => {
    const snap = await snapshot(page);
    return snap.fighters[0].activeMoveId !== null || snap.fighters[0].state !== 'idle';
  }).toBe(true);
  await page.waitForFunction(() => !(window as typeof window & { __ruaWorld: any }).__ruaWorld.fighters[0].currentMove);

  // --- Abraço Glacial ---
  await prepare(page, 350, { meter: 100, gutoFacing: 1 });
  await pressGrabCommand(page, 'down', mobile);
  await expect.poll(async () => (await snapshot(page)).activeGrab?.moveId).toBe('abracoGlacial');
  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('grabbedFront');
  await pollUntil(
    page,
    (snap) => (snap.fighters[1].victimPoseFrame ?? -1) >= 7
      && snap.fighters[1].state === 'grabbedFront',
    'Abraço pose 7 front',
  );
  await expect.poll(async () => (await snapshot(page)).fighters[1].state).toBe('frozen');
  await saveEvidence(page, `abraco-frozen-${testInfo.project.name}`);
  await pollUntil(
    page,
    (snap) => snap.activeGrab === null && snap.fighters[1].grabbedBy === null,
    'Abraço release',
    20_000,
  );
  await saveEvidence(page, `after-abraco-release-${testInfo.project.name}`);
  const afterAbraco = await snapshot(page);
  expect(afterAbraco.fighters[1].health).toBeLessThan(healthBefore - 155);
  expect(afterAbraco.frame).toBeGreaterThan(frameBefore);

  // --- Guto à direita de Dante (olha para a esquerda) ---
  // gutoFacing -1: Guto em X maior, Dante à esquerda → comando trás-relativo = left.
  await prepare(page, 250, { gutoFacing: -1 });
  // Confirma lados: P1 (Guto) deve estar à direita do Dante.
  {
    const sides = await snapshot(page);
    expect(sides.fighters[0].id).toBe('guto-barba');
    expect(sides.fighters[0].x ?? 0).toBeGreaterThan(sides.fighters[1].x ?? 0);
  }
  // Com Guto à direita, facing=-1; Frente+Especial = left + special.
  await pressGrabCommand(page, 'left', mobile);
  await expect.poll(async () => (await snapshot(page)).fighters[0].activeMoveId, {
    timeout: 8_000,
  }).toBe('ganchoUrso');
  await expect.poll(async () => (await snapshot(page)).activeGrab?.moveId, {
    timeout: 8_000,
  }).toBe('ganchoUrso');
  await pollUntil(
    page,
    (snap) => (snap.fighters[0].stateFrame ?? 0) >= 12
      && (snap.fighters[1].victimPoseFrame ?? -1) >= 4,
    'Gancho espelhado pose 4',
  );
  await pollUntil(
    page,
    (snap) => snap.activeGrab === null && snap.fighters[1].grabbedBy === null,
    'Gancho espelhado release',
  );

  // --- Bomba de Fumaça ativa ---
  await prepare(page, 350, { gutoFacing: 1, bomba: true });
  const bombaHealth = (await snapshot(page)).fighters[1].health;
  await pressGrabCommand(page, 'right', mobile);
  await expect.poll(async () => (await snapshot(page)).activeGrab?.moveId).toBe('ganchoUrso');
  await pollUntil(
    page,
    (snap) => snap.activeGrab === null && snap.fighters[1].grabbedBy === null,
    'Gancho com Bomba release',
  );
  const afterBomba = await snapshot(page);
  const dealt = bombaHealth - afterBomba.fighters[1].health;
  expect(dealt).toBeGreaterThan(0);
  expect(dealt).toBeLessThan(155);

  // Continuity: world frame still advancing
  const f1 = (await snapshot(page)).frame;
  await page.waitForTimeout(100);
  const f2 = (await snapshot(page)).frame;
  expect(f2).toBeGreaterThan(f1);

  expect(pageErrors).toEqual([]);
  expect(consoleProblems.filter((m) => /Frame .* ausente|texture|404/iu.test(m))).toEqual([]);
});
