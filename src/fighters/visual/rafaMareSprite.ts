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

const FRAME_SIZE = 192;

function animation(id: FighterAnimationId, frameRate: number, repeat: number, customFrames?: number): FighterAnimationAsset {
  return {
    id,
    key: `rafa-mare-${id}`,
    path: `assets/fighters/rafa-mare/${files[id]}`,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames: customFrames ?? 4,
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
    jumpNeutral: animation('jumpNeutral', 8, 0, 2),
    jumpForward: animation('jumpForward', 8, 0, 2),
    jumpBackward: animation('jumpBackward', 8, 0, 2),
    fall: animation('fall', 8, 0, 2),
    landing: animation('landing', 8, 0, 2),
    crouch: animation('crouch', 6, 0),
    standingLight: animation('standingLight', 12, 0),
    standingHeavy: animation('standingHeavy', 9, 0),
    crouchLight: animation('crouchLight', 12, 0),
    crouchHeavy: animation('crouchHeavy', 9, 0),
    airLightNeutral: animation('airLightNeutral', 12, 0),
    airHeavyNeutral: animation('airHeavyNeutral', 9, 0),
    airLightForward: animation('airLightForward', 12, 0),
    airHeavyForward: animation('airHeavyForward', 9, 0),
    airLightBackward: animation('airLightBackward', 12, 0),
    airHeavyBackward: animation('airHeavyBackward', 9, 0),
    special: animation('special', 10, 0),
    hit: animation('hit', 10, 0),
    knockdown: animation('knockdown', 7, 0),
    victory: animation('victory', 7, -1),
  },
};
