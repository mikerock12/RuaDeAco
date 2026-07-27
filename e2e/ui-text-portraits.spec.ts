import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface LayoutEntry {
  readonly scene: string;
  readonly name: string;
  readonly kind: 'panel' | 'text';
  readonly nested: boolean;
  readonly visible: boolean;
  readonly panelName?: string;
  readonly padding: Readonly<{ x: number; y: number }>;
  readonly bounds: Bounds;
  readonly text?: string;
  readonly fontSize?: number;
}

interface PortraitEntry {
  readonly scene: string;
  readonly fighterId: string;
  readonly use: 'hud' | 'card' | 'profile' | 'hero';
  readonly width: number;
  readonly height: number;
  readonly frameKey: string;
}

const CARD_POINTS: readonly (readonly [number, number])[] = [
  [62, 116],
  [178, 116],
  [294, 116],
  [62, 238],
  [178, 238],
  [294, 238],
];
const FIGHTER_IDS = [
  'rafa-mare',
  'noir-reflexo',
  'astro-riso',
  'dante-sinal',
  'leo-violeta',
  'guto-barba',
] as const;

async function waitScene(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((name) => (
    (window as typeof window & { __RUA_SCENE_DEBUG__?: () => readonly string[] })
      .__RUA_SCENE_DEBUG__?.().includes(name)
  ), scene);
}

async function waitFightPhase(page: Page, phase: string): Promise<void> {
  await page.waitForFunction((expected) => {
    const world = (window as typeof window & {
      __ruaWorld?: { snapshot(): { phase: string } };
    }).__ruaWorld;
    return world?.snapshot().phase === expected;
  }, phase);
}

async function internalTap(page: Page, x: number, y: number, mobile: boolean): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas ausente');
  const targetX = box.x + x / 640 * box.width;
  const targetY = box.y + y / 360 * box.height;
  if (mobile) await page.touchscreen.tap(targetX, targetY);
  else await page.mouse.click(targetX, targetY);
}

async function layoutEntries(page: Page): Promise<readonly LayoutEntry[]> {
  return page.evaluate(() => (
    (window as typeof window & {
      __RUA_UI_LAYOUT_DEBUG__?: () => readonly LayoutEntry[];
    }).__RUA_UI_LAYOUT_DEBUG__?.() ?? []
  ));
}

async function portraitEntries(page: Page): Promise<readonly PortraitEntry[]> {
  return page.evaluate(() => (
    (window as typeof window & {
      __RUA_PORTRAIT_DEBUG__?: () => readonly PortraitEntry[];
    }).__RUA_PORTRAIT_DEBUG__?.() ?? []
  ));
}

async function assertLayout(page: Page, scene: string): Promise<void> {
  const entries = (await layoutEntries(page)).filter((entry) => entry.scene === scene);
  const panels = new Map(entries
    .filter((entry) => entry.kind === 'panel')
    .map((entry) => [entry.name, entry]));

  for (const entry of entries.filter((candidate) => candidate.visible)) {
    const { x, y, width, height } = entry.bounds;
    expect(Number.isInteger(x), `${scene}/${entry.name} x inteiro`).toBe(true);
    expect(Number.isInteger(y), `${scene}/${entry.name} y inteiro`).toBe(true);
    if (!entry.nested) {
      expect(x, `${scene}/${entry.name} saiu à esquerda`).toBeGreaterThanOrEqual(-1);
      expect(y, `${scene}/${entry.name} saiu no topo`).toBeGreaterThanOrEqual(-1);
      expect(x + width, `${scene}/${entry.name} saiu à direita`).toBeLessThanOrEqual(641);
      expect(y + height, `${scene}/${entry.name} saiu embaixo`).toBeLessThanOrEqual(361);
    }
    if (entry.kind === 'text' && entry.text?.trim()) {
      expect(entry.fontSize, `${scene}/${entry.name} abaixo do piso legível`)
        .toBeGreaterThanOrEqual(8);
    }
    if (!entry.panelName || entry.nested) continue;
    const panel = panels.get(entry.panelName);
    expect(panel, `${scene}/${entry.name} sem painel ${entry.panelName}`).toBeDefined();
    if (!panel) continue;
    const padding = entry.padding;
    expect(x, `${scene}/${entry.name} ultrapassa painel à esquerda`)
      .toBeGreaterThanOrEqual(panel.bounds.x + padding.x - 1);
    expect(y, `${scene}/${entry.name} ultrapassa painel no topo`)
      .toBeGreaterThanOrEqual(panel.bounds.y + padding.y - 1);
    expect(x + width, `${scene}/${entry.name} ultrapassa painel à direita`)
      .toBeLessThanOrEqual(panel.bounds.x + panel.bounds.width - padding.x + 1);
    expect(y + height, `${scene}/${entry.name} ultrapassa painel embaixo`)
      .toBeLessThanOrEqual(panel.bounds.y + panel.bounds.height - padding.y + 1);
  }
}

async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const phase = process.env.UI_AUDIT_PHASE ?? 'after';
  const project = testInfo.project.name.replace(/[^a-z0-9-]+/giu, '-');
  const directory = resolve('tmp/ui-audit/texts-portraits', phase);
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, `${project}-${name}.png`) });
}

async function selectCard(page: Page, index: number, mobile: boolean): Promise<void> {
  const point = CARD_POINTS[index];
  if (!point) throw new Error(`Card inexistente: ${index}`);
  if (mobile) {
    await internalTap(page, point[0], point[1], true);
    return;
  }
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas ausente');
  await page.mouse.move(
    box.x + point[0] / 640 * box.width,
    box.y + point[1] / 360 * box.height,
  );
}

async function confirmCard(page: Page, index: number, mobile: boolean): Promise<void> {
  await selectCard(page, index, mobile);
  await page.waitForTimeout(45);
  const point = CARD_POINTS[index];
  if (!point) throw new Error(`Card inexistente: ${index}`);
  await internalTap(page, point[0], point[1], mobile);
  await page.waitForTimeout(220);
}

test('textos e portraits permanecem contidos em todo o fluxo', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const mobile = testInfo.project.name.includes('mobile');
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const notFoundResponses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() === 404) notFoundResponses.push(response.url());
  });

  await page.goto('/');
  await waitScene(page, 'StartScene');
  await assertLayout(page, 'StartScene');
  await screenshot(page, testInfo, 'start');
  for (const use of ['hud', 'card', 'profile', 'hero'] as const) {
    await page.evaluate((portraitUse) => {
      (window as typeof window & {
        __RUA_PORTRAIT_GALLERY_DEBUG__?: (use: typeof portraitUse | null) => void;
      }).__RUA_PORTRAIT_GALLERY_DEBUG__?.(portraitUse);
    }, use);
    await page.waitForFunction((portraitUse) => {
      const portraits = (window as typeof window & {
        __RUA_PORTRAIT_DEBUG__?: () => readonly PortraitEntry[];
      }).__RUA_PORTRAIT_DEBUG__?.() ?? [];
      return portraits.filter(({ use }) => use === portraitUse).length === 6;
    }, use);
    await screenshot(page, testInfo, `portrait-grid-${use}`);
  }
  await page.evaluate(() => {
    (window as typeof window & {
      __RUA_PORTRAIT_GALLERY_DEBUG__?: (use: null) => void;
    }).__RUA_PORTRAIT_GALLERY_DEBUG__?.(null);
  });
  expect(await portraitEntries(page)).toHaveLength(0);

  if (mobile) await internalTap(page, 320, 180, true);
  else await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenuScene');
  await assertLayout(page, 'MainMenuScene');
  expect(new Set((await portraitEntries(page))
    .filter(({ scene, use }) => scene === 'MainMenuScene' && use === 'card')
    .map(({ fighterId }) => fighterId))).toEqual(new Set(FIGHTER_IDS));
  await screenshot(page, testInfo, 'main-menu');

  await internalTap(page, 320, 230, mobile);
  await waitScene(page, 'SettingsScene');
  await assertLayout(page, 'SettingsScene');
  await screenshot(page, testInfo, 'settings');

  await internalTap(page, 500, 296, mobile);
  await waitScene(page, 'ControlsScene');
  await internalTap(page, 320, 224, mobile);
  await page.waitForFunction(() => (
    (window as typeof window & {
      __RUA_CONTROLS_DEBUG__?: () => { capturing: boolean };
    }).__RUA_CONTROLS_DEBUG__?.().capturing === true
  ));
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => {
    const debug = (window as typeof window & {
      __RUA_CONTROLS_DEBUG__?: () => { rows: readonly { label: string; value: string }[] };
    }).__RUA_CONTROLS_DEBUG__?.();
    return debug?.rows.some(({ label, value }) => label === 'ESPECIAL' && value === 'T');
  });
  await assertLayout(page, 'ControlsScene');
  await screenshot(page, testInfo, 'controls-remapped');
  await page.keyboard.press('Escape');
  await waitScene(page, 'SettingsScene');
  await page.keyboard.press('Escape');
  await waitScene(page, 'MainMenuScene');

  await internalTap(page, 320, 128, mobile);
  await waitScene(page, 'CharacterSelectScene');
  await assertLayout(page, 'CharacterSelectScene');
  const cards = (await portraitEntries(page))
    .filter(({ scene, use }) => scene === 'CharacterSelectScene' && use === 'card');
  expect(new Set(cards.map(({ fighterId }) => fighterId))).toEqual(new Set(FIGHTER_IDS));
  expect(new Set(cards.map(({ frameKey }) => frameKey)).size).toBe(6);

  for (let repetition = 0; repetition < 2; repetition += 1) {
    for (const index of [1, 2, 3, 4, 5, 0]) {
      await selectCard(page, index, mobile);
      const expectedId = FIGHTER_IDS[index];
      await page.waitForFunction((fighterId) => {
        const portraits = (window as typeof window & {
          __RUA_PORTRAIT_DEBUG__?: () => readonly PortraitEntry[];
        }).__RUA_PORTRAIT_DEBUG__?.() ?? [];
        return portraits.some(({ scene, use, fighterId: id }) => (
          scene === 'CharacterSelectScene' && use === 'profile' && id === fighterId
        ));
      }, expectedId);
      const profiles = (await portraitEntries(page))
        .filter(({ scene, use }) => scene === 'CharacterSelectScene' && use === 'profile');
      expect(profiles).toHaveLength(1);
      if (repetition === 0) await screenshot(page, testInfo, `profile-${expectedId}`);
    }
  }

  await confirmCard(page, 2, mobile);
  await confirmCard(page, 5, mobile);
  const heroes = (await portraitEntries(page))
    .filter(({ scene, use }) => scene === 'CharacterSelectScene' && use === 'hero');
  expect(heroes).toHaveLength(2);
  await assertLayout(page, 'CharacterSelectScene');
  await screenshot(page, testInfo, 'versus');

  await internalTap(page, 320, 306, mobile);
  await waitScene(page, 'FightScene');
  await waitFightPhase(page, 'active');
  expect((await portraitEntries(page))
    .filter(({ scene, use }) => scene === 'UIScene' && use === 'hud')).toHaveLength(2);
  await assertLayout(page, 'UIScene');
  await screenshot(page, testInfo, 'fight-hud');

  if (mobile) await internalTap(page, 320, 55, true);
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => (
    (window as typeof window & { __RUA_PAUSE_DEBUG__?: () => { paused: boolean } })
      .__RUA_PAUSE_DEBUG__?.().paused === true
  ));
  await assertLayout(page, 'UIScene');
  const pauseTexts = (await layoutEntries(page))
    .filter(({ scene, name }) => scene === 'UIScene' && name.startsWith('pause-moves-'))
    .map(({ text }) => text ?? '');
  expect(pauseTexts.some((text) => (
    text.includes(mobile ? '+S ' : '+T ') && text.includes('SORRISO')
  ))).toBe(true);
  await screenshot(page, testInfo, 'pause-long-commands');

  if (mobile) await internalTap(page, 84, 295, true);
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => (
    (window as typeof window & { __RUA_PAUSE_DEBUG__?: () => { paused: boolean } })
      .__RUA_PAUSE_DEBUG__?.().paused === false
  ));
  await page.evaluate(() => {
    const world = (window as typeof window & {
      __ruaWorld: {
        fighters: [{ roundWins: number }, { health: number }];
        setPaused(value: boolean): void;
      };
    }).__ruaWorld;
    world.setPaused(false);
    world.fighters[0].roundWins = 1;
    world.fighters[1].health = 0;
  });
  await waitScene(page, 'ResultScene');
  await assertLayout(page, 'ResultScene');
  const resultPortraits = (await portraitEntries(page)).filter(({ scene }) => scene === 'ResultScene');
  expect(resultPortraits.some(({ use }) => use === 'hero')).toBe(true);
  expect(resultPortraits.some(({ use }) => use === 'profile')).toBe(true);
  await screenshot(page, testInfo, 'result');

  await internalTap(page, 450, 292, mobile);
  await waitScene(page, 'MainMenuScene');
  await internalTap(page, 320, 196, mobile);
  await waitScene(page, 'CharacterSelectScene');
  await confirmCard(page, 0, mobile);
  await confirmCard(page, 5, mobile);
  await internalTap(page, 320, 306, mobile);
  await waitScene(page, 'FightScene');
  await waitFightPhase(page, 'active');
  await assertLayout(page, 'UIScene');
  await screenshot(page, testInfo, 'training-hud');

  if (mobile) {
    const up = page.locator('.touch-cluster.dpad .touch-button.up');
    const upBox = await up.boundingBox();
    expect(upBox).not.toBeNull();
    if (upBox) {
      const beforeY = await page.evaluate(() => (
        (window as typeof window & {
          __ruaWorld: { snapshot(): { fighters: readonly { y: number }[] } };
        }).__ruaWorld.snapshot().fighters[0]?.y ?? 0
      ));
      await page.touchscreen.tap(upBox.x + upBox.width / 2, upBox.y + upBox.height * 0.35);
      await page.waitForFunction((startY) => (
        ((window as typeof window & {
          __ruaWorld: { snapshot(): { fighters: readonly { y: number }[] } };
        }).__ruaWorld.snapshot().fighters[0]?.y ?? startY) < startY
      ), beforeY);
    }

    const light = page.locator('.touch-cluster.buttons .touch-button.pos-ne');
    const lightBox = await light.boundingBox();
    expect(lightBox).not.toBeNull();
    if (lightBox) {
      await page.touchscreen.tap(
        lightBox.x + lightBox.width / 2,
        lightBox.y + lightBox.height * 0.35,
      );
      await page.waitForFunction(() => Boolean(
        (window as typeof window & {
          __ruaWorld: { snapshot(): { fighters: readonly { activeMoveId: string | null }[] } };
        }).__ruaWorld.snapshot().fighters[0]?.activeMoveId,
      ));
    }
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(notFoundResponses).toEqual([]);
});
