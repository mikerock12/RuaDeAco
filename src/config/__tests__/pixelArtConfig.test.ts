import { describe, expect, it } from 'vitest';
import {
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  PRESENTATION_HEIGHT,
  PRESENTATION_WIDTH,
  WORLD_TO_SCREEN,
  worldRectToScreen,
  worldToScreen,
} from '../pixelArtConfig';

describe('pixelArtConfig', () => {
  it('mantém o viewport interno 16:9 em 640x360 com apresentação 2x', () => {
    expect(INTERNAL_WIDTH).toBe(640);
    expect(INTERNAL_HEIGHT).toBe(360);
    expect(INTERNAL_WIDTH / INTERNAL_HEIGHT).toBe(16 / 9);
    expect(WORLD_TO_SCREEN).toBe(1);
    expect(PRESENTATION_WIDTH / INTERNAL_WIDTH).toBe(2);
    expect(PRESENTATION_HEIGHT / INTERNAL_HEIGHT).toBe(2);
  });

  it('projeta as coordenadas do combate sem alterar a simulação', () => {
    expect(worldToScreen(304)).toBe(304);
    expect(worldToScreen(188)).toBe(188);
    expect(worldToScreen(452)).toBe(452);
  });

  it('não reduz caixas pequenas a largura ou altura zero', () => {
    expect(worldRectToScreen({ x: 1, y: 1, width: 1, height: 1 })).toEqual({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
  });
});
