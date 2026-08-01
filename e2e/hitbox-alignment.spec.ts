import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

type FighterId = 'rafa-mare' | 'noir-reflexo' | 'astro-riso' | 'dante-sinal' | 'leo-violeta' | 'guto-barba';

const FIGHTERS: readonly FighterId[] = [
  'rafa-mare', 'noir-reflexo', 'astro-riso',
  'dante-sinal', 'leo-violeta', 'guto-barba',
];
const INDEX: Readonly<Record<FighterId, number>> = {
  'rafa-mare': 0, 'noir-reflexo': 1, 'astro-riso': 2,
  'dante-sinal': 3, 'leo-violeta': 4, 'guto-barba': 5,
};
const POINTS = [[62, 116], [178, 116], [294, 116], [62, 238], [178, 238], [294, 238]] as const;
const MOVES: Readonly<Record<FighterId, {
  normal: string; low: string; air: string; special: string; projectile: boolean;
}>> = {
  'rafa-mare': { normal: 'lightPunch', low: 'rasteira', air: 'jumpHeavyForward', special: 'chuteRessaca', projectile: false },
  'noir-reflexo': { normal: 'lightPunch', low: 'sweep', air: 'jumpHeavyForward', special: 'quebraLuz', projectile: true },
  'astro-riso': { normal: 'lightPunch', low: 'rasteira', air: 'jumpHeavyForward', special: 'sorrisoRelampago', projectile: false },
  'dante-sinal': { normal: 'lightPunch', low: 'rasteira', air: 'jumpHeavyForward', special: 'chaveBinaria', projectile: true },
  'leo-violeta': { normal: 'lightPunch', low: 'sweep', air: 'jumpHeavyForward', special: 'impactoSombrio', projectile: false },
  'guto-barba': { normal: 'elbow', low: 'rasteiraUrso', air: 'jumpHeavyForward', special: 'muralhaNorte', projectile: false },
};
const EVIDENCE = resolve(process.cwd(), 'tmp', 'hitbox-audit', 'e2e');

async function scenes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (window as any).__RUA_SCENE_DEBUG__?.() ?? []);
}

async function waitScene(page: Page, name: string): Promise<void> {
  await expect.poll(() => scenes(page)).toContain(name);
}

async function press(page: Page, key: string, delay = 80): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(delay);
}

async function tapInternal(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas sem dimensões.');
  await page.touchscreen.tap(box.x + x / 640 * box.width, box.y + y / 360 * box.height);
}

async function choose(
  page: Page,
  fighterId: FighterId,
  mobile: boolean,
  startIndex = 0,
): Promise<void> {
  const index = INDEX[fighterId];
  if (mobile) {
    const [x, y] = POINTS[index]!;
    await tapInternal(page, x, y);
    await page.waitForTimeout(50);
    await tapInternal(page, x, y);
  } else {
    const startRow = Math.floor(startIndex / 3);
    const startColumn = startIndex % 3;
    const targetRow = Math.floor(index / 3);
    const targetColumn = index % 3;
    for (let row = startRow; row < targetRow; row += 1) await press(page, 'KeyS');
    for (let row = startRow; row > targetRow; row -= 1) await press(page, 'KeyW');
    for (let column = startColumn; column < targetColumn; column += 1) await press(page, 'KeyD');
    for (let column = startColumn; column > targetColumn; column -= 1) await press(page, 'KeyA');
    await press(page, 'Enter', 180);
  }
  await page.waitForTimeout(180);
}

async function openFight(page: Page, testInfo: TestInfo, fighterId: FighterId): Promise<void> {
  const mobile = testInfo.project.name === 'chrome-mobile-landscape';
  await page.goto('/');
  await waitScene(page, 'StartScene');
  if (mobile) await tapInternal(page, 320, 180);
  else await press(page, 'Enter');
  await waitScene(page, 'MainMenuScene');
  if (mobile) await tapInternal(page, 320, 196);
  else {
    await press(page, 'KeyS');
    await press(page, 'KeyS');
    await press(page, 'Enter');
  }
  await waitScene(page, 'CharacterSelectScene');
  await choose(page, fighterId, mobile, 0);
  const opponent = fighterId === 'guto-barba' ? 'rafa-mare' : 'guto-barba';
  await choose(page, opponent, mobile, fighterId === 'rafa-mare' ? 1 : 0);
  if (mobile) await tapInternal(page, 320, 306);
  else await press(page, 'Enter', 200);
  await waitScene(page, 'FightScene');
  await page.waitForFunction(() => (window as any).__ruaWorld?.snapshot().phase === 'active');
  await page.keyboard.press('F1');
  await page.keyboard.press('F9');
  await page.evaluate(() => (window as any).__RUA_CAPTURE_DEBUG__.pause());
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(EVIDENCE, { recursive: true });
  const file = resolve(EVIDENCE, `${name}-${testInfo.project.name}.png`);
  const body = await page.screenshot({ path: file });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

async function bodyContact(
  page: Page,
  moveId: string,
  facing: 1 | -1,
  phase: 'before' | 'contact' | 'after' | 'contact-only',
): Promise<{ damage: number; poseFrame: number; hitIds: readonly string[] }> {
  return page.evaluate(({ moveId, facing, phase }) => {
    const root = window as any;
    const world = root.__ruaWorld;
    const debug = root.__RUA_CAPTURE_DEBUG__;
    world.mode = 'training';
    world.trainingCpuEnabled = false;
    world.resetTrainingPositions();
    world.mode = 'versus';
    const attacker = world.fighters[0];
    const defender = world.fighters[1];
    const move = attacker.definition.moves[moveId];
    if (!move?.hitboxes.length) throw new Error(`Golpe corporal ausente: ${moveId}`);
    const range = move.hitboxes[0].range;
    attacker.x = facing === 1 ? 260 : 380;
    attacker.previousX = attacker.x;
    attacker.facing = facing;
    defender.facing = facing === 1 ? -1 : 1;
    attacker.startMove(move);
    attacker.stateFrame = phase === 'before' ? range.from - 1
      : phase === 'after' ? range.to + 1 : range.from;
    if (move.air) {
      attacker.y = 250;
      attacker.previousY = 250;
      defender.y = 250;
      defender.previousY = 250;
    }

    const probeFrame = attacker.stateFrame;
    attacker.stateFrame = range.from;
    let boxes = attacker.getActiveHitboxes();
    const hit = boxes[0];
    if (!hit) throw new Error(`Hitbox não resolveu: ${moveId}`);
    if (move.air) boxes = attacker.getActiveHitboxes();
    const hitFront = Math.max(...boxes.map((box: any) => box.x + box.width));
    const matching = defender.getHurtboxes().filter((target: any) => boxes.some((box: any) =>
      attacker.y + box.y + box.height > defender.y + target.y
      && attacker.y + box.y < defender.y + target.y + target.height));
    const hurtFront = Math.min(...(matching.length ? matching : defender.getHurtboxes()).map((box: any) => box.x));
    const distance = hitFront - hurtFront - 1;
    defender.x = attacker.x + facing * distance;
    defender.previousX = defender.x;
    attacker.stateFrame = probeFrame;
    const health = defender.health;
    world.drainEvents();
    debug.step();
    const worldSnapshot = world.snapshot();
    const snapshot = worldSnapshot.fighters[0];
    const damage = health - defender.health;
    return {
      damage,
      poseFrame: snapshot.poseStateFrame,
      hitIds: damage > 0 && snapshot.poseMoveId ? [snapshot.poseMoveId] : [],
    };
  }, { moveId, facing, phase });
}

async function projectileContact(page: Page, moveId: string): Promise<{ damage: number; hitIds: readonly string[] }> {
  return page.evaluate(({ moveId }) => {
    const root = window as any;
    const world = root.__ruaWorld;
    const debug = root.__RUA_CAPTURE_DEBUG__;
    world.mode = 'training';
    world.resetTrainingPositions();
    world.mode = 'versus';
    const attacker = world.fighters[0];
    const defender = world.fighters[1];
    attacker.x = 280;
    defender.x = 400;
    attacker.facing = 1;
    defender.facing = -1;
    const move = attacker.definition.moves[moveId];
    const spawn = move.events.find((event: any) => event.type === 'spawnProjectile');
    attacker.startMove(move);
    attacker.stateFrame = spawn.frame;
    const health = defender.health;
    world.drainEvents();
    const hitIds: string[] = [];
    for (let frame = 0; frame < 150 && defender.health === health; frame += 1) {
      debug.step();
      hitIds.push(...world.drainEvents()
        .filter((event: any) => event.type === 'hit')
        .map((event: any) => event.moveId ?? event.text));
    }
    const damage = health - defender.health;
    return { damage, hitIds: damage > 0 ? [moveId] : hitIds };
  }, { moveId });
}

async function prepareRealInput(
  page: Page,
  attackerIndex: 0 | 1,
  moveId: string,
): Promise<{ defenderIndex: 0 | 1; health: number }> {
  return page.evaluate(async ({ attackerIndex, moveId }) => {
    const root = window as any;
    // @ts-expect-error caminho absoluto é resolvido pelo Vite no navegador E2E.
    const { gameSession } = await import('/src/config/session.ts');
    gameSession.setSelection({ mode: 'versus' });
    const world = root.__ruaWorld;
    const debug = root.__RUA_CAPTURE_DEBUG__;
    debug.pause();
    world.mode = 'training';
    world.resetTrainingPositions();
    world.mode = 'versus';
    const defenderIndex = attackerIndex === 0 ? 1 : 0;
    const attacker = world.fighters[attackerIndex];
    const defender = world.fighters[defenderIndex];
    const facing = attackerIndex === 0 ? 1 : -1;
    const move = attacker.definition.moves[moveId];
    attacker.startMove(move);
    attacker.stateFrame = move.hitboxes[0].range.from;
    const boxes = attacker.getActiveHitboxes();
    const hitFront = Math.max(...boxes.map((box: any) => box.x + box.width));
    const matching = defender.getHurtboxes().filter((target: any) => boxes.some((box: any) =>
      box.y + box.height > target.y && box.y < target.y + target.height));
    const hurtFront = Math.min(...matching.map((box: any) => box.x));
    const distance = hitFront - hurtFront - 1;
    attacker.resetPosition(attackerIndex === 0 ? 260 : 380, facing);
    defender.resetPosition(attacker.x + facing * distance, facing === 1 ? -1 : 1);
    debug.resume();
    return { defenderIndex, health: defender.health };
  }, { attackerIndex, moveId });
}

async function fighterHealth(page: Page, index: 0 | 1): Promise<number> {
  return page.evaluate((fighterIndex) => (window as any).__ruaWorld.fighters[fighterIndex].health, index);
}

async function touchChord(page: Page, actions: readonly string[]): Promise<void> {
  const points = [];
  let id = 1;
  for (const action of actions) {
    const box = await page.locator(`#touch-controls [data-action="${action}"]`).first().boundingBox();
    if (!box) throw new Error(`Controle touch ausente: ${action}`);
    points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, id: id++ });
  }
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await page.waitForTimeout(90);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function gamepadLight(page: Page, pressed: boolean): Promise<void> {
  await page.evaluate((active) => {
    const root = window as any;
    if (!root.__HITBOX_PAD__) {
      const pad = {
        index: 0,
        id: 'Xbox Hitbox Audit Controller',
        connected: true,
        mapping: 'standard',
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        axes: [0, 0, 0, 0],
        timestamp: 1,
      };
      root.__HITBOX_PAD__ = pad;
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [pad, null, null, null],
      });
    }
    root.__HITBOX_PAD__.buttons[0].pressed = active;
    root.__HITBOX_PAD__.buttons[0].value = active ? 1 : 0;
    root.__HITBOX_PAD__.timestamp += 1;
  }, pressed);
}

test('contact sheet offline carrega todos os overlays finais', async ({ page }, testInfo) => {
  await page.goto('/tmp/hitbox-audit/after-contact-sheet.html');
  await expect(page.locator('figure')).toHaveCount(92);
  await expect.poll(() => page.locator('img').evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete
      && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  mkdirSync(EVIDENCE, { recursive: true });
  const file = resolve(EVIDENCE, `contact-sheet-after-${testInfo.project.name}.png`);
  const body = await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach('contact-sheet-after', { body, contentType: 'image/png' });
});

for (const fighterId of FIGHTERS) {
  test(`${fighterId}: normal, baixo, aéreo e especial alinham caixa/pose e causam dano`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await openFight(page, testInfo, fighterId);
    const moves = MOVES[fighterId];

    const before = await bodyContact(page, moves.normal, 1, 'before');
    expect(before.damage).toBe(0);
    await capture(page, testInfo, `${fighterId}-normal-before`);
    const contact = await bodyContact(page, moves.normal, 1, 'contact');
    expect(contact.damage).toBeGreaterThan(0);
    expect(contact.hitIds).toContain(moves.normal);
    await capture(page, testInfo, `${fighterId}-normal-contact`);
    const after = await bodyContact(page, moves.normal, 1, 'after');
    expect(after.damage).toBe(0);
    await capture(page, testInfo, `${fighterId}-normal-after`);

    const mirrored = await bodyContact(page, moves.normal, -1, 'contact-only');
    expect(mirrored.damage).toBe(contact.damage);
    await capture(page, testInfo, `${fighterId}-normal-mirrored`);

    const low = await bodyContact(page, moves.low, 1, 'contact-only');
    expect(low.damage).toBeGreaterThan(0);
    await capture(page, testInfo, `${fighterId}-low-contact`);

    const air = await bodyContact(page, moves.air, 1, 'contact-only');
    expect(air.damage).toBeGreaterThan(0);
    await capture(page, testInfo, `${fighterId}-air-contact`);

    const special = moves.projectile
      ? await projectileContact(page, moves.special)
      : await bodyContact(page, moves.special, 1, 'contact-only');
    expect(special.damage).toBeGreaterThan(0);
    expect(special.hitIds).toContain(moves.special);
    await capture(page, testInfo, `${fighterId}-special-contact`);

    const mobile = testInfo.project.name === 'chrome-mobile-landscape';
    const realInput = await prepareRealInput(page, 0, moves.normal);
    if (mobile) await touchChord(page, ['light']);
    else await page.keyboard.press('KeyF');
    await expect.poll(() => fighterHealth(page, realInput.defenderIndex))
      .toBeLessThan(realInput.health);

    if (fighterId === 'rafa-mare' && mobile) {
      const multiTouch = await prepareRealInput(page, 0, 'rasteira');
      await touchChord(page, ['down', 'heavy']);
      await expect.poll(() => fighterHealth(page, multiTouch.defenderIndex))
        .toBeLessThan(multiTouch.health);
    }

    if (fighterId === 'rafa-mare' && !mobile) {
      const p2 = await prepareRealInput(page, 1, 'elbow');
      await page.keyboard.press('KeyJ');
      await expect.poll(() => fighterHealth(page, p2.defenderIndex)).toBeLessThan(p2.health);

      const pad = await prepareRealInput(page, 0, moves.normal);
      await gamepadLight(page, true);
      await expect.poll(() => fighterHealth(page, pad.defenderIndex)).toBeLessThan(pad.health);
      await gamepadLight(page, false);
    }
  });
}
