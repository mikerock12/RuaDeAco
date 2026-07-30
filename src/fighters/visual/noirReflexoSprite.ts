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
  special1: 'reflexo-negro.png',
  special2: 'quebra-luz.png',
  special3: 'impacto-solar.png',
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
    key: `noir-reflexo-${id}`,
    path: `assets/fighters/noir-reflexo/${files[id]}`,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames,
    layout: 'horizontal',
    frameRate,
    repeat,
  };
}

function effect(options: {
  readonly id: string;
  readonly file: string;
  readonly moveId: string;
  readonly usage: FighterEffectAsset['usage'];
  readonly activeRange?: FighterEffectAsset['activeRange'];
  readonly statusField?: FighterEffectAsset['statusField'];
  readonly offset: FighterEffectAsset['offset'];
  readonly warningFrameCount?: number;
}): FighterEffectAsset {
  return {
    id: options.id,
    key: `noir-reflexo-effect-${options.id}`,
    path: `assets/fighters/noir-reflexo/${options.file}`,
    moveId: options.moveId,
    usage: options.usage,
    ...(options.activeRange ? { activeRange: options.activeRange } : {}),
    ...(options.statusField ? { statusField: options.statusField } : {}),
    ...(options.warningFrameCount ? { warningFrameCount: options.warningFrameCount } : {}),
    origin: { x: 0.5, y: 0.5 },
    offset: options.offset,
    scale: 1,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    frames: 4,
    layout: 'horizontal',
    frameRate: 12,
    repeat: options.usage === 'status' ? -1 : 0,
  };
}

export const noirReflexoSpriteAsset: FighterSpriteAsset = {
  fighterId: 'noir-reflexo',
  frameWidth: FRAME_SIZE,
  frameHeight: FRAME_SIZE,
  origin: { x: 0.5, y: 1 },
  scale: 1,
  visualOffset: { x: 0, y: FIGHTER_OPAQUE_BOTTOM_PADDING['noir-reflexo'] },
  hitboxGuide: [{ x: 12, y: -118, width: 88, height: 62 }],
  hurtboxGuide: [
    { x: -20, y: -133, width: 40, height: 41 },
    { x: -29, y: -92, width: 58, height: 92 },
  ],
  effects: [
    effect({
      id: 'reflexo-negro', file: 'reflexo-negro-effect.png',
      moveId: 'reflexoNegro', usage: 'attached',
      activeRange: { from: 5, to: 11 }, offset: { x: 8, y: -86 },
    }),
    effect({
      id: 'quebra-luz', file: 'quebra-luz-effect.png',
      moveId: 'quebraLuz', usage: 'projectile', offset: { x: 0, y: 0 },
    }),
    effect({
      id: 'impacto-solar', file: 'impacto-solar-effect.png',
      moveId: 'impactoSolar', usage: 'projectile',
      offset: { x: 0, y: 0 }, warningFrameCount: 1,
    }),
    effect({
      id: 'quebra-luz-status', file: 'quebra-luz-status-effect.png',
      moveId: 'quebraLuz', usage: 'status',
      statusField: 'offensiveDebuffFrames', offset: { x: 0, y: -78 },
    }),
  ],
  movePhases: {},
  animations: {
    idle: animation('idle', 8, -1),
    walk: animation('walk', 12, -1),
    walkBackward: animation('walkBackward', 10, -1),
    jumpNeutral: animation('jumpNeutral', 10, 0),
    jumpForward: animation('jumpForward', 10, 0),
    jumpBackward: animation('jumpBackward', 10, 0),
    fall: animation('fall', 10, 0),
    landing: animation('landing', 14, 0),
    crouch: animation('crouch', 8, 0),
    standingLight: animation('standingLight', 14, 0),
    standingHeavy: animation('standingHeavy', 10, 0),
    forwardLight: animation('forwardLight', 13, 0),
    forwardHeavy: animation('forwardHeavy', 10, 0),
    crouchLight: animation('crouchLight', 14, 0),
    crouchHeavy: animation('crouchHeavy', 10, 0),
    airLightNeutral: animation('airLightNeutral', 14, 0),
    airHeavyNeutral: animation('airHeavyNeutral', 10, 0),
    airLightForward: animation('airLightForward', 14, 0),
    airHeavyForward: animation('airHeavyForward', 10, 0),
    airLightBackward: animation('airLightBackward', 14, 0),
    airHeavyBackward: animation('airHeavyBackward', 10, 0),
    special1: animation('special1', 12, 0),
    special2: animation('special2', 12, 0),
    special3: animation('special3', 12, 0),
    blockStanding: animation('blockStanding', 9, 0),
    blockCrouching: animation('blockCrouching', 9, 0),
    hit: animation('hit', 12, 0),
    knockdown: animation('knockdown', 8, 0),
    wakeUp: animation('wakeUp', 11, 0),
    grabbedFront: animation('grabbedFront', 30, 0, 8),
    grabbedLifted: animation('grabbedLifted', 30, 0, 8),
    thrown: animation('thrown', 11, 0),
    frozen: animation('frozen', 8, -1),
    knockout: animation('knockout', 7, 0),
    victory: animation('victory', 9, -1),
  },
};
