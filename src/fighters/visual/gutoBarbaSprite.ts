import type { FighterAnimationAsset, FighterAnimationId, FighterSpriteAsset } from '../../types/assets';

const files: Readonly<Record<FighterAnimationId, string>> = {
  idle: 'idle.png',
  walk: 'walk.png',
  jump: 'jump.png',
  crouch: 'crouch.png',
  lightAttack: 'light-attack.png',
  heavyAttack: 'heavy-attack.png',
  special: 'special.png',
  hit: 'hit.png',
  knockdown: 'knockdown.png',
  victory: 'victory.png',
};

function animation(id: FighterAnimationId, frameRate: number, repeat: number): FighterAnimationAsset {
  return {
    id,
    key: `guto-barba-${id}`,
    path: `assets/fighters/guto-barba/${files[id]}`,
    frameWidth: 96,
    frameHeight: 96,
    frames: 4,
    frameRate,
    repeat,
  };
}

export const gutoBarbaSpriteAsset: FighterSpriteAsset = {
  fighterId: 'guto-barba',
  frameWidth: 96,
  frameHeight: 96,
  origin: { x: 0.5, y: 1 },
  scale: 1,
  visualOffset: { x: 0, y: 2 },
  hitboxGuide: [{ x: 4, y: -66, width: 54, height: 42 }],
  hurtboxGuide: [
    { x: -15, y: -75, width: 30, height: 23 },
    { x: -21, y: -53, width: 42, height: 53 },
  ],
  animations: {
    idle: animation('idle', 5, -1),
    walk: animation('walk', 7, -1),
    jump: animation('jump', 6, 0),
    crouch: animation('crouch', 5, 0),
    lightAttack: animation('lightAttack', 9, 0),
    heavyAttack: animation('heavyAttack', 7, 0),
    special: animation('special', 7, 0),
    hit: animation('hit', 8, 0),
    knockdown: animation('knockdown', 6, 0),
    victory: animation('victory', 6, -1),
  },
};
