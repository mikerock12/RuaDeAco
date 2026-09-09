import { expect, test, type Page } from '@playwright/test';
import { clickCanvas } from './helpers/selection';

interface StageDebug {
  arena: string;
  ambience?: {
    elapsed: number;
    eggsLaid: number;
    eggsEaten: { snake: number; lizard: number };
    fights: number;
    animals: { species: string; x: number; y: number; action: string }[];
  };
}
type GameWindow = Window & {
  __RUA_AUDIO_DEBUG__?: () => { currentTrack: string | null; contextState: string; activeVoices: number };
  __RUA_SCENE_DEBUG__?: () => string[];
  __RUA_STAGE_DEBUG__?: () => StageDebug;
  __RUA_UI_LAYOUT_DEBUG__?: () => { name: string; text?: string }[];
  __ruaWorld?: { paused: boolean };
};
const stage = (page: Page) => page.evaluate(() => (window as GameWindow).__RUA_STAGE_DEBUG__?.());
const text = (page: Page, name: string) => page.evaluate(key => (
  (window as GameWindow).__RUA_UI_LAYOUT_DEBUG__?.().find(entry => entry.name === key)?.text
), name);
const scene = (page: Page, name: string) => expect.poll(() => page.evaluate(() => (
  (window as GameWindow).__RUA_SCENE_DEBUG__?.()
))).toContain(name);

test('Sítio tem todas as espécies, ovos, alimentação, disputas e pausa sem resíduos', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const tap = (x: number, y: number) => clickCanvas(page, x, y, isMobile);
  await page.goto('/');
  await scene(page, 'StartScene');
  await tap(320, 180);
  await scene(page, 'MainMenuScene');
  await tap(320, 186);
  await scene(page, 'CharacterSelectScene');
  await tap(502, 302);
  await expect.poll(() => text(page, 'character-select-phase')).toContain('TREINO');
  await tap(502, 302);
  await expect.poll(() => text(page, 'character-select-phase')).toBe('ARENA E CONFRONTO');
  await expect.poll(() => text(page, 'arena-name')).toBe('CAIS DA CIDADE');
  await tap(590, 86);
  await expect.poll(() => text(page, 'arena-name')).toBe('COZINHA MACABRA');
  await tap(590, 86);
  await expect.poll(() => text(page, 'arena-name')).toBe('SITIO');
  await page.screenshot({ path: testInfo.outputPath('sitio-selecao.png') });
  await tap(320, 306);
  await scene(page, 'FightScene');
  await expect.poll(async () => (await stage(page))?.arena).toBe('sitio');
  const initial = (await stage(page))!.ambience!;
  expect([...new Set(initial.animals.map(animal => animal.species))].sort()).toEqual(['duck', 'hen', 'lizard', 'snake']);
  await expect.poll(async () => (await stage(page))?.ambience?.eggsLaid).toBeGreaterThan(0);
  await expect.poll(async () => (await stage(page))?.ambience?.eggsEaten.snake, { timeout: 20000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await stage(page))?.ambience?.eggsEaten.lizard, { timeout: 20000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await stage(page))?.ambience?.fights, { timeout: 30000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_AUDIO_DEBUG__?.().currentTrack)).toBe('sitio');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_AUDIO_DEBUG__?.().contextState)).toBe('running');
  await page.keyboard.down('KeyA');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: testInfo.outputPath('sitio-luta.png') });
  if (isMobile) await tap(608, 58);
  else await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__ruaWorld?.paused)).toBe(true);
  const frozen = await stage(page);
  await page.waitForTimeout(650);
  expect(await stage(page)).toEqual(frozen);
  await tap(84, 300);
  await expect.poll(async () => (await stage(page))?.ambience?.elapsed ?? 0).toBeGreaterThan(frozen!.ambience!.elapsed);
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
