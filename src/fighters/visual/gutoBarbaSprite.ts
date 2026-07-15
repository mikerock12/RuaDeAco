import type { FighterAnimationAsset, FighterAnimationId, FighterSpriteAsset } from '../../types/assets';

const files: Readonly<Record<FighterAnimationId, string>> = {
  idle: 'idle.png',
  walk: 'walk.png',
  jump: 'jump.png',
  crouch: 'crouch.png',
  lightAttack: 'light-attack.png',
  heavyAttack: 'heavy-attack.png',
  crouchLightAttack: 'crouch-light-attack.png',
  crouchHeavyAttack: 'crouch-heavy-attack.png',
  special: 'special.png',
  hit: 'hit.png',
  knockdown: 'knockdown.png',
  victory: 'victory.png',
};

const FRAME_SIZE = 256;

function animation(id: FighterAnimationId, frameRate: number, repeat: number): FighterAnimationAsset {
  return {
    id,
    key: `guto-barba-${id}`,
    path: `assets/fighters/guto-barba/${files[id]}`,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames: 4,
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
    jump: animation('jump', 6, 0),
    crouch: animation('crouch', 5, 0),
    lightAttack: animation('lightAttack', 9, 0),
    heavyAttack: animation('heavyAttack', 7, 0),
    crouchLightAttack: animation('crouchLightAttack', 9, 0),
    crouchHeavyAttack: animation('crouchHeavyAttack', 7, 0),
    special: animation('special', 7, 0),
    hit: animation('hit', 8, 0),
    knockdown: animation('knockdown', 6, 0),
    victory: animation('victory', 6, -1),
  },
};
