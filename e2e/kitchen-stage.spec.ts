import { expect, test, type Page } from '@playwright/test';
import { clickCanvas } from './helpers/selection';

interface StageDebug {
  arena: string;
  ambience?: {
    elapsed: number;
    batWaves: number;
    ratSpawns: number;
    witchFrame: string | number;
    bats: { x: number; y: number; visible: boolean; frame: string | number }[];
    rats: { x: number; y: number; visible: boolean; frame: string | number }[];
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

test('seleciona a cozinha, anima a fauna e a bruxa, pausa e volta sem objetos residuais', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(60000);
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
  await tap(50, 86);
  await expect.poll(() => text(page, 'arena-name')).toBe('CAIS DA CIDADE');
  if (isMobile) await tap(590, 86);
  else await page.keyboard.press('KeyD');
  await expect.poll(() => text(page, 'arena-name')).toBe('COZINHA MACABRA');
  await page.screenshot({ path: testInfo.outputPath('cozinha-selecao.png') });
  await tap(320, 306);
  await scene(page, 'FightScene');
  await expect.poll(async () => (await stage(page))?.arena).toBe('cozinha-macabra');
  const initial = (await stage(page))!.ambience!;
  await expect.poll(async () => (await stage(page))?.ambience?.witchFrame).not.toBe(initial.witchFrame);
  await expect.poll(async () => (await stage(page))?.ambience?.batWaves).toBeGreaterThan(0);
  await expect.poll(async () => (await stage(page))?.ambience?.rats.some(rat => rat.visible)).toBe(true);
  await expect.poll(async () => (await stage(page))?.ambience?.bats.some(bat => bat.visible)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_AUDIO_DEBUG__?.().currentTrack)).toBe('cozinha-macabra');
  await expect.poll(() => page.evaluate(() => (window as GameWindow).__RUA_AUDIO_DEBUG__?.().contextState)).toBe('running');
  await page.keyboard.down('KeyA');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: testInfo.outputPath('cozinha-luta.png') });
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
