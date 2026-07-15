import type { FighterAnimationAsset, FighterAnimationId, FighterSpriteAsset } from '../../types/assets';

const files: Readonly<Record<FighterAnimationId, string>> = {
  idle: 'idle.png',
  walk: 'walk.png',
  jumpNeutral: 'jump-neutral.png',
  jumpForward: 'jump-forward.png',
  jumpBackward: 'jump-backward.png',
  fall: 'fall.png',
  landing: 'landing.png',
  crouch: 'crouch.png',
  standingLight: 'standing-light.png',
  standingHeavy: 'standing-heavy.png',
  crouchLight: 'crouch-light.png',
  crouchHeavy: 'crouch-heavy.png',
  airLightNeutral: 'air-light-neutral.png',
  airHeavyNeutral: 'air-heavy-neutral.png',
  airLightForward: 'air-light-forward.png',
  airHeavyForward: 'air-heavy-forward.png',
  airLightBackward: 'air-light-backward.png',
  airHeavyBackward: 'air-heavy-backward.png',
  special: 'special.png',
  hit: 'hit.png',
  knockdown: 'knockdown.png',
  victory: 'victory.png',
};

const FRAME_SIZE = 256;

function animation(id: FighterAnimationId, frameRate: number, repeat: number, customFrames?: number): FighterAnimationAsset {
  return {
    id,
    key: `guto-barba-${id}`,
    path: `assets/fighters/guto-barba/${files[id]}`,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames: customFrames ?? 4,
    frameRate,
    repeat,
  };
}

// Tank/grappler: silhueta larga ~210px de altura em frames 256x256.
export const gutoBarbaSpriteAsset: FighterSpriteAsset = {
  fighterId: 'guto-barba',
  frameWidth: FRAME_SIZE,
  frameHeight: FRAME_SIZE,
  origin: { x: 0.5, y: 1 },
  scale: 1,
  visualOffset: { x: 0, y: 4 },
  hitboxGuide: [{ x: 8, y: -132, width: 108, height: 84 }],
  hurtboxGuide: [
    { x: -30, y: -150, width: 60, height: 46 },
    { x: -42, y: -106, width: 84, height: 106 },
  ],
  animations: {
    idle: animation('idle', 5, -1),
    walk: animation('walk', 7, -1),
    jumpNeutral: animation('jumpNeutral', 6, 0, 2),
    jumpForward: animation('jumpForward', 6, 0, 2),
    jumpBackward: animation('jumpBackward', 6, 0, 2),
    fall: animation('fall', 6, 0, 2),
    landing: animation('landing', 6, 0, 2),
    crouch: animation('crouch', 5, 0),
    standingLight: animation('standingLight', 9, 0),
    standingHeavy: animation('standingHeavy', 7, 0),
    crouchLight: animation('crouchLight', 9, 0),
    crouchHeavy: animation('crouchHeavy', 7, 0),
    airLightNeutral: animation('airLightNeutral', 9, 0),
    airHeavyNeutral: animation('airHeavyNeutral', 7, 0),
    airLightForward: animation('airLightForward', 9, 0),
    airHeavyForward: animation('airHeavyForward', 7, 0),
    airLightBackward: animation('airLightBackward', 9, 0),
    airHeavyBackward: animation('airHeavyBackward', 7, 0),
    special: animation('special', 7, 0),
    hit: animation('hit', 8, 0),
    knockdown: animation('knockdown', 6, 0),
    victory: animation('victory', 6, -1),
  },
};
