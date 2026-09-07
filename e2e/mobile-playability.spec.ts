import { expect, test, type Page } from '@playwright/test';
import type { CombatWorld } from '../src/combat/CombatWorld';
import type { UiLayoutDebugEntry } from '../src/utils/text';
import { VIEWPORT_SETTLE_DELAY_MS } from '../src/utils/viewportLayout';

type GameWindow = Window & {
  __RUA_SCENE_DEBUG__?: () => string[];
  __RUA_UI_LAYOUT_DEBUG__?: () => UiLayoutDebugEntry[];
  __RUA_PAUSE_LIST_DEBUG__?: () => { lines: string[] };
  __ruaWorld?: CombatWorld;
};

async function scene(page: Page, name: string) {
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_SCENE_DEBUG__?.())).toContain(name);
}
async function tap(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + x * box.width / 640, box.y + y * box.height / 360);
}
async function paused(page: Page) {
  return page.evaluate(() => (window as GameWindow).__ruaWorld?.paused);
}
async function openTraining(page: Page, astro = false) {
  await page.goto('/');
  await scene(page, 'StartScene');
  await tap(page, 320, 180);
  await scene(page, 'MainMenuScene');
  await tap(page, 320, 186);
  await scene(page, 'CharacterSelectScene');
  if (astro) await tap(page, 294, 116);
  await tap(page, 502, 302);
  await expect.poll(() => page.evaluate(() =>
    (window as GameWindow).__RUA_UI_LAYOUT_DEBUG__?.().find((item) => item.name === 'character-select-phase')?.text,
  )).toContain('TREINO');
  await tap(page, 502, 302);
  await expect.poll(() => page.evaluate(() =>
    (window as GameWindow).__RUA_UI_LAYOUT_DEBUG__?.().find((item) => item.name === 'character-select-phase')?.text,
  )).toBe('ARENA E CONFRONTO');
  await tap(page, 320, 306);
  await scene(page, 'FightScene');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld?.phase)).toBe('active');
}
async function center(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Regressões de multitouch do celular.');
  page.on('pageerror', (error) => { throw error; });
});

for (const viewport of [{ width: 640, height: 360 }, { width: 812, height: 375 }, { width: 568, height: 320 }]) {
  test('fluxo somente touch e pausa legível em ' + viewport.width + 'x' + viewport.height, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openTraining(page);
    const buttons = await page.locator('.touch-button').evaluateAll((elements) =>
      elements.map((element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }; }));
    for (const button of buttons) {
      expect(button.w).toBeGreaterThanOrEqual(44);
      expect(button.h).toBeGreaterThanOrEqual(44);
      expect(button.x).toBeGreaterThanOrEqual(0);
      expect(button.y + button.h).toBeLessThanOrEqual(viewport.height);
    }
    await tap(page, 608, 82);
    await expect.poll(() => paused(page)).toBe(true);
    await expect(page.locator('#touch-controls')).not.toBeVisible();
    const timer = await page.evaluate(() => (window as GameWindow).__ruaWorld?.snapshot().timeSeconds);
    for (const [index, title] of ['COMO JOGAR', 'NO CHAO', 'NO AR', 'ESPECIAIS'].entries()) {
      await tap(page, 96 + index * 148, 118);
      const entries = await page.evaluate(() => (window as GameWindow).__RUA_UI_LAYOUT_DEBUG__?.() ?? []);
      const lines = entries.filter((entry) => entry.visible && entry.name.startsWith('touch-moves-line'));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.fontSize).toBeGreaterThanOrEqual(14);
        expect(line.bounds.x + line.bounds.width).toBeLessThanOrEqual(610);
        expect(line.bounds.y + line.bounds.height).toBeLessThan(284);
      }
      await page.screenshot({ path: testInfo.outputPath(title + '.png') });
    }
    expect(await page.evaluate(() => (window as GameWindow).__ruaWorld?.snapshot().timeSeconds)).toBe(timer);
    await tap(page, 84, 300);
    await expect.poll(() => paused(page)).toBe(false);
    await expect(page.locator('#touch-controls')).toBeVisible();
    await tap(page, 608, 82);
    await tap(page, 548, 300);
    await scene(page, 'MainMenuScene');
  });
}

test('multitouch: diagonal direta, defesa baixa, arraste entre golpes e cancelamento', async ({ page, context }) => {
  await openTraining(page);
  const cdp = await context.newCDPSession(page);
  const dpad = (await page.locator('.dpad').boundingBox())!;
  const diagonal = { id: 1, x: dpad.x + dpad.width * 0.82, y: dpad.y + dpad.height * 0.82 };
  const block = { id: 2, ...await center(page, '[data-action="block"]') };
  const pressed = (action: string) => page.locator('[data-action="' + action + '"]').getAttribute('class');
  // Inicia no espaço entre setas, sem exigir acertar um botão cardinal.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [diagonal] });
  await expect.poll(() => pressed('down')).toContain('pressed');
  await expect.poll(() => pressed('right')).toContain('pressed');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [diagonal, block] });
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld?.fighters[0].state)).toBe('blockCrouching');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [block] });
  await expect.poll(() => pressed('block')).not.toContain('pressed');
  await expect.poll(() => pressed('down')).toContain('pressed');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.touch-button.pressed')).toHaveCount(0);

  const light = { id: 3, ...await center(page, '[data-action="light"]') };
  const heavy = { id: 3, ...await center(page, '[data-action="heavy"]') };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [light] });
  await expect.poll(() => pressed('light')).toContain('pressed');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [heavy] });
  await expect.poll(() => pressed('heavy')).toContain('pressed');
  await expect.poll(() => pressed('light')).not.toContain('pressed');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 3, x: 360, y: 180 }] });
  await expect(page.locator('.touch-button.pressed')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('andar sem pulo acidental, sair da área e girar soltam o input', async ({ page, context }) => {
  await openTraining(page);
  const cdp = await context.newCDPSession(page);
  const dpad = (await page.locator('.dpad').boundingBox())!;
  const point = { id: 1, x: dpad.x + dpad.width * 0.9, y: dpad.y + dpad.height * 0.36 };
  const before = await page.evaluate(() => (window as GameWindow).__ruaWorld!.fighters[0].x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld!.fighters[0].x)).toBeGreaterThan(before);
  expect(await page.evaluate(() => (window as GameWindow).__ruaWorld!.fighters[0].grounded)).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 360, y: 180 }] });
  await expect(page.locator('.touch-button.pressed')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('#rotate-warning')).toBeVisible();
  await expect.poll(() => paused(page)).toBe(true);
  await page.setViewportSize({ width: 812, height: 375 });
  // Aguarda o refresh final do Phaser antes de tocar coordenadas do canvas.
  await page.waitForTimeout(VIEWPORT_SETTLE_DELAY_MS + 50);
  await expect(page.locator('#rotate-warning')).not.toBeVisible();
  await expect.poll(() => paused(page)).toBe(true);
  await tap(page, 84, 300);
  await expect.poll(() => paused(page)).toBe(false);
  await expect(page.locator('.touch-button.pressed')).toHaveCount(0);
  await page.locator('[data-action="special"]').tap();
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld!.fighters[0].lastMoveId)).toBe('maoDaMare');
});

test('gesto baixo, diagonal e frente executa a Rajada Neon do Astro', async ({ page, context }) => {
  await openTraining(page, true);
  const cdp = await context.newCDPSession(page);
  const box = (await page.locator('.dpad').boundingBox())!;
  const at = (x: number, y: number) => ({ id: 1, x: box.x + x * box.width, y: box.y + y * box.height });
  const down = at(0.5, 0.9);
  const diagonal = at(0.82, 0.82);
  const forward = at(0.9, 0.5);
  const frames = () => page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [down] });
  await frames();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [diagonal] });
  await frames();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [forward] });
  await frames();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [forward, { id: 2, ...await center(page, '[data-action="special"]') }],
  });
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld!.fighters[0].lastMoveId)).toBe('rajadaNeon');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.touch-button.pressed')).toHaveCount(0);
});
