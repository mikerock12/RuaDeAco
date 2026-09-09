import { expect, test, type Page } from '@playwright/test';
import { clickCanvas } from './helpers/selection';
import type { CombatWorld } from '../src/combat/CombatWorld';
import type { CaisStageView } from '../src/ui/CaisStageView';

type GameWindow = Window & {
  __RUA_AUDIO_DEBUG__?: () => { currentTrack: string | null; activeVoices: number };
  __RUA_SCENE_DEBUG__?: () => string[];
  __RUA_STAGE_DEBUG__?: () => { arena: string; ambience: ReturnType<CaisStageView['snapshot']> };
  __RUA_UI_LAYOUT_DEBUG__?: () => { name: string; text?: string }[];
  __ruaWorld?: CombatWorld;
};
const stage = (page: Page) => page.evaluate(() => (window as GameWindow).__RUA_STAGE_DEBUG__?.());
const scene = (page: Page, name: string) => expect.poll(() => page.evaluate(() => (
  (window as GameWindow).__RUA_SCENE_DEBUG__?.()
))).toContain(name);
const fighters = (page: Page) => page.evaluate(() => (window as GameWindow).__ruaWorld?.fighters.map(f => ({ x: f.x, y: f.y, health: f.health })));
const label = (page: Page, name: string) => page.evaluate(key => (
  (window as GameWindow).__RUA_UI_LAYOUT_DEBUG__?.().find(entry => entry.name === key)?.text
), name);

test('Cais remasterizado anima sem interferir na luta, respeita pausa e descarta a ambientação', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(110000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.text().includes('__MISSING')) errors.push(message.text());
  });
  const tap = (x: number, y: number) => clickCanvas(page, x, y, isMobile);
  await page.goto('/');
  await scene(page, 'StartScene');
  await tap(320, 180);
  await scene(page, 'MainMenuScene');
  await tap(320, 186);
  await scene(page, 'CharacterSelectScene');
  await tap(502, 302);
  await expect.poll(() => label(page, 'character-select-phase')).toContain('TREINO');
  await tap(502, 302);
  await expect.poll(() => label(page, 'character-select-phase')).toBe('ARENA E CONFRONTO');
  await expect.poll(() => label(page, 'arena-name')).toBe('CAIS DA CIDADE');
  await page.screenshot({ path: testInfo.outputPath('cais-selecao.png') });
  await tap(320, 306);
  await scene(page, 'FightScene');
  await expect.poll(async () => (await stage(page))?.arena).toBe('cais-da-cidade');
  const initial = (await stage(page))!.ambience;
  expect(initial.event).toBeNull();
  await expect.poll(async () => (await stage(page))?.ambience.waterPhase).not.toBe(initial.waterPhase);
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_AUDIO_DEBUG__?.().currentTrack)).toBe('cais-da-cidade');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld?.phase)).toBe('active');
  const resting = await fighters(page);
  await page.screenshot({ path: testInfo.outputPath('cais-luta.png') });
  await expect.poll(async () => (await stage(page))?.ambience.event, { timeout: 12000 }).not.toBeNull();
  await expect.poll(async () => (await stage(page))?.ambience.eventTime).toBeGreaterThan(3500);
  await page.screenshot({ path: testInfo.outputPath('cais-evento.png') });
  expect(await fighters(page)).toEqual(resting);
  if (isMobile) await tap(608, 58);
  else await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld?.paused)).toBe(true);
  const frozen = await stage(page);
  await page.waitForTimeout(650);
  expect(await stage(page)).toEqual(frozen);
  await tap(84, 300);
  await expect.poll(async () => (await stage(page))?.ambience.elapsed ?? 0).toBeGreaterThan(frozen!.ambience.elapsed);
  await expect.poll(async () => (await stage(page))?.ambience.completed, { timeout: 45000 }).toBeGreaterThan(0);
  const quiet = (await stage(page))!.ambience;
  expect(quiet.event).toBeNull();
  expect(quiet.idleRemaining).toBeGreaterThan(7000);
  expect(quiet.idleRemaining).toBeLessThanOrEqual(17000);
  expect([quiet.ufo, quiet.witch, quiet.monster, quiet.ship, quiet.cannonball].every(actor => !actor.visible)).toBe(true);
  expect(quiet.beamStrength + quiet.fireStrength).toBe(0);
  expect(await fighters(page)).toEqual(resting);
  if (isMobile) await tap(608, 58);
  else await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld?.paused)).toBe(true);
  await tap(548, 300);
  await scene(page, 'MainMenuScene');
  expect(await stage(page)).toBeUndefined();
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_AUDIO_DEBUG__?.().currentTrack)).toBe('main-menu');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_AUDIO_DEBUG__?.().activeVoices)).toBe(1);
  expect(errors).toEqual([]);
});
