import { describe, expect, it } from 'vitest';
import {
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  WORLD_TO_SCREEN,
  worldRectToScreen,
  worldToScreen,
} from '../pixelArtConfig';

describe('pixelArtConfig', () => {
  it('mantém o viewport interno 16:9 em 320x180', () => {
    expect(INTERNAL_WIDTH).toBe(320);
    expect(INTERNAL_HEIGHT).toBe(180);
    expect(INTERNAL_WIDTH / INTERNAL_HEIGHT).toBe(16 / 9);
    expect(WORLD_TO_SCREEN).toBe(0.5);
  });

  it('projeta as coordenadas do combate sem alterar a simulação', () => {
    expect(worldToScreen(304)).toBe(152);
    expect(worldToScreen(188)).toBe(94);
    expect(worldToScreen(452)).toBe(226);
  });

  it('não reduz caixas pequenas a largura ou altura zero', () => {
    expect(worldRectToScreen({ x: 1, y: 1, width: 1, height: 1 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
});
