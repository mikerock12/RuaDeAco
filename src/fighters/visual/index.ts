import type { FighterId } from '../../types/combat';
import type { FighterEffectAsset, FighterSpriteAsset } from '../../types/assets';
import { astroRisoSpriteAsset } from './astroRisoSprite';
import { danteSinalSpriteAsset } from './danteSinalSprite';
import { gutoBarbaSpriteAsset } from './gutoBarbaSprite';
import { leoVioletaSpriteAsset } from './leoVioletaSprite';
import { noirReflexoSpriteAsset } from './noirReflexoSprite';
import { rafaMareSpriteAsset } from './rafaMareSprite';

export {
  astroRisoSpriteAsset,
  danteSinalSpriteAsset,
  gutoBarbaSpriteAsset,
  leoVioletaSpriteAsset,
  noirReflexoSpriteAsset,
  rafaMareSpriteAsset,
};

export const FIGHTER_SPRITE_ASSETS: readonly FighterSpriteAsset[] = [
  rafaMareSpriteAsset,
  astroRisoSpriteAsset,
  gutoBarbaSpriteAsset,
  danteSinalSpriteAsset,
  leoVioletaSpriteAsset,
  noirReflexoSpriteAsset,
];

export function getFighterSpriteAsset(id: FighterId): FighterSpriteAsset | null {
  return FIGHTER_SPRITE_ASSETS.find((asset) => asset.fighterId === id) ?? null;
}

export function getFighterEffectAsset(
  fighterId: FighterId,
  moveId: string,
  usage: FighterEffectAsset['usage'],
): FighterEffectAsset | null {
  return getFighterSpriteAsset(fighterId)?.effects
    .find((effect) => effect.moveId === moveId && effect.usage === usage) ?? null;
}
