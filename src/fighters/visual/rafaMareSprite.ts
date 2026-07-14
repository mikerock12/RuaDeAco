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
    key: `rafa-mare-${id}`,
    path: `assets/fighters/rafa-mare/${files[id]}`,
    frameWidth: 96,
    frameHeight: 96,
    frames: 4,
    frameRate,
    repeat,
  };
}

export const rafaMareSpriteAsset: FighterSpriteAsset = {
  fighterId: 'rafa-mare',
  frameWidth: 96,
  frameHeight: 96,
  origin: { x: 0.5, y: 1 },
  scale: 1,
  visualOffset: { x: 0, y: 2 },
  hitboxGuide: [{ x: 8, y: -58, width: 42, height: 28 }],
  hurtboxGuide: [
    { x: -11, y: -68, width: 22, height: 22 },
    { x: -15, y: -47, width: 30, height: 47 },
  ],
  animations: {
    idle: animation('idle', 6, -1),
    walk: animation('walk', 10, -1),
    jump: animation('jump', 8, 0),
    crouch: animation('crouch', 6, 0),
    lightAttack: animation('lightAttack', 12, 0),
    heavyAttack: animation('heavyAttack', 9, 0),
    special: animation('special', 10, 0),
    hit: animation('hit', 10, 0),
    knockdown: animation('knockdown', 7, 0),
    victory: animation('victory', 7, -1),
  },
};
