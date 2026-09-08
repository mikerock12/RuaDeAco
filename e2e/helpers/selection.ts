import { expect, type Page } from '@playwright/test';

export async function clickCanvas(page: Page, x: number, y: number, touch: boolean): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const point = { x: box.x + x * box.width / 640, y: box.y + y * box.height / 360 };
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

export async function confirmTrainingSelection(page: Page): Promise<void> {
  const phase = () => page.evaluate(() => (
    (window as typeof window & {
      __RUA_UI_LAYOUT_DEBUG__?: () => readonly { name: string; text?: string }[];
    }).__RUA_UI_LAYOUT_DEBUG__?.().find((entry) => entry.name === 'character-select-phase')?.text
  ));
  await expect.poll(phase).toContain('JOGADOR 1');
  await page.keyboard.press('Enter');
  await expect.poll(phase).toContain('TREINO');
  await page.keyboard.press('Enter');
  await expect.poll(phase).toBe('ARENA E CONFRONTO');
  await page.keyboard.press('Enter');
}
