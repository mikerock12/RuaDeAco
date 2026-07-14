import type { FighterId } from '../../types/combat';
import type { FighterSpriteAsset } from '../../types/assets';
import { gutoBarbaSpriteAsset } from './gutoBarbaSprite';
import { rafaMareSpriteAsset } from './rafaMareSprite';

export { gutoBarbaSpriteAsset, rafaMareSpriteAsset };

export const FIGHTER_SPRITE_ASSETS: readonly FighterSpriteAsset[] = [
  rafaMareSpriteAsset,
  gutoBarbaSpriteAsset,
];

export function getFighterSpriteAsset(id: FighterId): FighterSpriteAsset | null {
  return FIGHTER_SPRITE_ASSETS.find((asset) => asset.fighterId === id) ?? null;
}
