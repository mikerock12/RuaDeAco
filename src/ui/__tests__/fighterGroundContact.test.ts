import { describe, expect, it } from 'vitest';
import { VISUAL_GROUND_Y } from '../../config/pixelArtConfig';
import { gutoBarbaSpriteAsset } from '../../fighters/visual/gutoBarbaSprite';
import {
  FIGHTER_OPAQUE_BOTTOM_PADDING,
  resolveVisualSoleY,
} from '../../fighters/visual/groundContact';
import { rafaMareSpriteAsset } from '../../fighters/visual/rafaMareSprite';

describe('contato opaco dos lutadores com o cais', () => {
  it.each([
    ['Rafa', rafaMareSpriteAsset, FIGHTER_OPAQUE_BOTTOM_PADDING['rafa-mare']],
    ['Guto', gutoBarbaSpriteAsset, FIGHTER_OPAQUE_BOTTOM_PADDING['guto-barba']],
  ] as const)('%s alinha o último pixel opaco à linha lógica', (_name, asset, padding) => {
    expect(padding).toBe(6);
    expect(resolveVisualSoleY(VISUAL_GROUND_Y, asset.visualOffset.y, padding))
      .toBe(VISUAL_GROUND_Y);
  });
});
