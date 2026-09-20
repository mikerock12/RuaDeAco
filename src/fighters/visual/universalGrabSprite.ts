import type { FighterId } from '../../types/combat';
import type { FighterAnimationAsset } from '../../types/assets';
export function universalGrabSprite(fighter: FighterId, size: number): FighterAnimationAsset {
  return { id: 'universalGrab', key: fighter + '-universalGrab-v2',
    path: 'assets/fighters/' + fighter + '/universal-grab-v2.png',
    frameWidth: size, frameHeight: size, frames: 12, layout: 'horizontal', frameRate: 18, repeat: 0 };
}
