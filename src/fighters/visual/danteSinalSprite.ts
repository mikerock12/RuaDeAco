import type {
  FighterAnimationAsset,
  FighterEffectAsset,
  FighterSpriteAsset,
  SharedFighterAnimationId,
} from '../../types/assets';
import { FIGHTER_OPAQUE_BOTTOM_PADDING } from './groundContact';

const files: Readonly<Record<SharedFighterAnimationId, string>> = {
  idle: 'idle.png',
  walk: 'corrida.png',
  walkBackward: 'walk-backward.png',
  jumpNeutral: 'jump-neutral.png',
  jumpForward: 'jump-forward.png',
  jumpBackward: 'jump-backward.png',
  fall: 'fall.png',
  landing: 'landing.png',
  crouch: 'crouch.png',
  standingLight: 'standing-light.png',
  standingHeavy: 'standing-heavy.png',
  forwardLight: 'forward-light.png',
  forwardHeavy: 'forward-heavy.png',
  crouchLight: 'crouch-light.png',
  crouchHeavy: 'crouch-heavy.png',
  airLightNeutral: 'air-light-neutral.png',
  airHeavyNeutral: 'air-heavy-neutral.png',
  airLightForward: 'air-light-forward.png',
  airHeavyForward: 'air-heavy-forward.png',
  airLightBackward: 'air-light-backward.png',
  airHeavyBackward: 'air-heavy-backward.png',
  special1: 'chave-binaria.png',
  special2: 'bomba-fumaca.png',
  special3: 'ponto-final.png',
  blockStanding: 'block-standing.png',
  blockCrouching: 'block-crouching.png',
  hit: 'hit.png',
  knockdown: 'knockdown.png',
  wakeUp: 'wake-up.png',
  grabbedFront: 'grabbed-front.png',
  grabbedLifted: 'grabbed-lifted.png',
  thrown: 'thrown.png',
  frozen: 'frozen.png',
  knockout: 'knockout.png',
  victory: 'victory.png',
};

const FRAME_SIZE = 256;

function animation(
  id: SharedFighterAnimationId,
  frameRate: number,
  repeat: number,
  frames = 4,
): FighterAnimationAsset {
  return {
    id,
    key: `dante-sinal-${id}`,
    path: `assets/fighters/dante-sinal/${files[id]}`,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames,
    layout: 'horizontal',
    frameRate,
    repeat,
  };
}

function effect(
  id: string,
  file: string,
  moveId: string,
  usage: FighterEffectAsset['usage'],
  options: {
    activeRange?: FighterEffectAsset['activeRange'];
    offset?: FighterEffectAsset['offset'];
    statusField?: FighterEffectAsset['statusField'];
    warningFrameCount?: number;
    frameRate?: number;
    repeat?: number;
    scale?: number;
  } = {},
): FighterEffectAsset {
  const {
    activeRange,
    offset = { x: 0, y: 0 },
    statusField,
    warningFrameCount,
    frameRate = 12,
    repeat,
    scale = 1,
  } = options;
  return {
    id,
    key: `dante-sinal-effect-${id}`,
    path: `assets/fighters/dante-sinal/${file}`,
    moveId,
    usage,
    ...(activeRange ? { activeRange } : {}),
    ...(statusField ? { statusField } : {}),
    ...(warningFrameCount !== undefined ? { warningFrameCount } : {}),
    origin: { x: 0.5, y: 0.5 },
    offset,
    scale,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames: 4,
    layout: 'horizontal',
    frameRate,
    repeat: repeat ?? (usage === 'projectile' || usage === 'status' ? -1 : 0),
  };
}

export const danteSinalSpriteAsset: FighterSpriteAsset = {
  fighterId: 'dante-sinal',
  frameWidth: FRAME_SIZE,
  frameHeight: FRAME_SIZE,
  origin: { x: 0.5, y: 1 },
  scale: 1,
  visualOffset: { x: 0, y: FIGHTER_OPAQUE_BOTTOM_PADDING['dante-sinal'] },
  hitboxGuide: [{ x: 16, y: -116, width: 84, height: 56 }],
  hurtboxGuide: [
    { x: -22, y: -136, width: 44, height: 44 },
    { x: -30, y: -94, width: 60, height: 94 },
  ],
  effects: [
    // Fumaça ligada ao status genérico damageReductionFrames (sobrevive ao fim do move).
    effect('bomba-fumaca', 'bomba-fumaca-effect.png', 'bombaFumaca', 'status', {
      statusField: 'damageReductionFrames',
      offset: { x: 0, y: -48 },
      scale: 1.15,
      frameRate: 10,
      repeat: -1,
    }),
    effect('chave-binaria-hazard', 'chave-binaria-effect.png', 'chaveBinaria', 'projectile', {
      offset: { x: 0, y: 0 },
      scale: 0.85,
      frameRate: 14,
      repeat: -1,
    }),
    effect('ponto-final-hazard', 'ponto-final-effect.png', 'pontoFinal', 'projectile', {
      // 2 frames de mira/aviso + 2 de explosão (sem loop na fase active)
      warningFrameCount: 2,
      frameRate: 10,
      repeat: 0,
      scale: 1.05,
    }),
  ],
  movePhases: {},
  animations: {
    idle: animation('idle', 6, -1),
    walk: animation('walk', 10, -1),
    walkBackward: animation('walkBackward', 8, -1),
    jumpNeutral: animation('jumpNeutral', 8, 0),
    jumpForward: animation('jumpForward', 8, 0),
    jumpBackward: animation('jumpBackward', 8, 0),
    fall: animation('fall', 8, 0),
    landing: animation('landing', 12, 0),
    crouch: animation('crouch', 6, 0),
    standingLight: animation('standingLight', 12, 0),
    standingHeavy: animation('standingHeavy', 9, 0),
    forwardLight: animation('forwardLight', 12, 0),
    forwardHeavy: animation('forwardHeavy', 9, 0),
    crouchLight: animation('crouchLight', 10, 0),
    crouchHeavy: animation('crouchHeavy', 9, 0),
    airLightNeutral: animation('airLightNeutral', 12, 0),
    airHeavyNeutral: animation('airHeavyNeutral', 9, 0),
    airLightForward: animation('airLightForward', 12, 0),
    airHeavyForward: animation('airHeavyForward', 9, 0),
    airLightBackward: animation('airLightBackward', 12, 0),
    airHeavyBackward: animation('airHeavyBackward', 9, 0),
    special1: animation('special1', 10, 0),
    special2: animation('special2', 10, 0),
    special3: animation('special3', 10, 0),
    blockStanding: animation('blockStanding', 8, 0),
    blockCrouching: animation('blockCrouching', 8, 0),
    hit: animation('hit', 10, 0),
    knockdown: animation('knockdown', 7, 0),
    wakeUp: animation('wakeUp', 9, 0),
    grabbedFront: animation('grabbedFront', 12, 0, 8),
    grabbedLifted: animation('grabbedLifted', 12, 0, 8),
    thrown: animation('thrown', 10, 0),
    frozen: animation('frozen', 8, -1),
    knockout: animation('knockout', 6, 0),
    victory: animation('victory', 7, -1),
  },
};
