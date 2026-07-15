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

const FRAME_SIZE = 192;

function animation(id: FighterAnimationId, frameRate: number, repeat: number): FighterAnimationAsset {
  return {
    id,
    key: `rafa-mare-${id}`,
    path: `assets/fighters/rafa-mare/${files[id]}`,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames: 4,
    frameRate,
    repeat,
  };
}

// Rushdown ágil: corpo atlético ~176px de altura em frames 192x192.
export const rafaMareSpriteAsset: FighterSpriteAsset = {
  fighterId: 'rafa-mare',
  frameWidth: FRAME_SIZE,
  frameHeight: FRAME_SIZE,
  origin: { x: 0.5, y: 1 },
  scale: 1,
  visualOffset: { x: 0, y: 4 },
  hitboxGuide: [{ x: 16, y: -116, width: 84, height: 56 }],
  hurtboxGuide: [
    { x: -22, y: -136, width: 44, height: 44 },
    { x: -30, y: -94, width: 60, height: 94 },
  ],
  animations: {
    idle: animation('idle', 6, -1),
    walk: animation('walk', 10, -1),
    jump: animation('jump', 8, 0),
    crouch: animation('crouch', 6, 0),
    lightAttack: animation('lightAttack', 12, 0),
    heavyAttack: animation('heavyAttack', 9, 0),
    crouchLightAttack: animation('crouchLightAttack', 12, 0),
    crouchHeavyAttack: animation('crouchHeavyAttack', 9, 0),
    special: animation('special', 10, 0),
    hit: animation('hit', 10, 0),
    knockdown: animation('knockdown', 7, 0),
    victory: animation('victory', 7, -1),
  },
};
