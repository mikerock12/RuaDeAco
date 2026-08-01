import type {
  FighterAnimationAsset,
  FighterAnimationId,
  FighterEffectAsset,
  FighterSpriteAsset,
} from '../../types/assets';
import { FIGHTER_OPAQUE_BOTTOM_PADDING } from './groundContact';

const files: Readonly<Record<FighterAnimationId, string>> = {
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
  special1: 'muralha-norte.png',
  special2: 'gancho-do-urso-startup.png',
  special2Grab: 'gancho-do-urso-grab.png',
  special2Hold: 'gancho-do-urso-hold.png',
  special2Throw: 'gancho-do-urso-throw.png',
  special2Recovery: 'gancho-do-urso-recovery.png',
  special3: 'abraco-glacial-startup.png',
  special3Grab: 'abraco-glacial-grab.png',
  special3Hold: 'abraco-glacial-hold.png',
  special3Freeze: 'abraco-glacial-freeze.png',
  special3Finish: 'abraco-glacial-finish.png',
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

const FRAME_SIZE = 288;
const GRAB_FRAME_SIZE = 256;

interface VariableAnimationOptions {
  readonly frames?: number;
  readonly frameSize?: number;
}

function animation(
  id: FighterAnimationId,
  frameRate: number,
  repeat: number,
  options: VariableAnimationOptions = {},
): FighterAnimationAsset {
  const frames = options.frames ?? 4;
  const frameSize = options.frameSize ?? FRAME_SIZE;
  return {
    id,
    key: `guto-barba-${id}`,
    path: `assets/fighters/guto-barba/${files[id]}`,
    frameWidth: frameSize,
    frameHeight: frameSize,
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
  activeRange: FighterEffectAsset['activeRange'],
  offset: FighterEffectAsset['offset'],
  attachTo?: 'attacker' | 'victim',
  options: VariableAnimationOptions = {},
): FighterEffectAsset {
  const frames = options.frames ?? 4;
  const frameSize = options.frameSize ?? FRAME_SIZE;
  return {
    id,
    key: `guto-barba-effect-${id}`,
    path: `assets/fighters/guto-barba/${file}`,
    moveId,
    usage: 'attached',
    attachTo: attachTo ?? 'attacker',
    ...(activeRange ? { activeRange } : {}),
    origin: { x: 0.5, y: 0.5 },
    offset,
    scale: 1,
    frameWidth: frameSize,
    frameHeight: frameSize,
    frames,
    layout: 'horizontal',
    frameRate: 10,
    repeat: 0,
  };
}

// Todos os frames corporais foram medidos: há 6 px transparentes abaixo da sola.
export const gutoBarbaSpriteAsset: FighterSpriteAsset = {
  fighterId: 'guto-barba',
  frameWidth: FRAME_SIZE,
  frameHeight: FRAME_SIZE,
  origin: { x: 0.5, y: 1 },
  scale: 1,
  visualOffset: { x: 0, y: FIGHTER_OPAQUE_BOTTOM_PADDING['guto-barba'] },
  legacyHitboxGuide: [{ x: 8, y: -132, width: 108, height: 84 }],
  legacyHurtboxGuide: [
    { x: -30, y: -150, width: 60, height: 46 },
    { x: -42, y: -106, width: 84, height: 106 },
  ],
  effects: [
    effect('muralha-norte', 'muralha-norte-effect.png', 'muralhaNorte', { from: 4, to: 36 }, { x: 36, y: -112 }),
    {
      ...effect(
        'abraco-glacial',
        'abraco-glacial-effect.png',
        'abracoGlacial',
        { from: 28, to: 94 },
        { x: 0, y: -116 },
        'victim',
        { frames: 12, frameSize: GRAB_FRAME_SIZE },
      ),
      frameTimeline: [
        { range: { from: 28, to: 28 }, frame: 0 },
        { range: { from: 29, to: 29 }, frame: 1 },
        { range: { from: 30, to: 30 }, frame: 2 },
        { range: { from: 31, to: 31 }, frame: 3 },
        { range: { from: 32, to: 32 }, frame: 4 },
        { range: { from: 33, to: 54 }, frame: 5 },
        { range: { from: 55, to: 77 }, frame: 6 },
        { range: { from: 78, to: 81 }, frame: 7 },
        { range: { from: 82, to: 84 }, frame: 8 },
        { range: { from: 85, to: 87 }, frame: 9 },
        { range: { from: 88, to: 90 }, frame: 10 },
        { range: { from: 91, to: 94 }, frame: 11 },
      ],
    },
  ],
  movePhases: {
    ganchoUrso: [
      { animation: 'special2', range: { from: 0, to: 7 } },
      { animation: 'special2Grab', range: { from: 8, to: 13 } },
      { animation: 'special2Hold', range: { from: 14, to: 29 } },
      { animation: 'special2Throw', range: { from: 30, to: 39 } },
      { animation: 'special2Recovery', range: { from: 40, to: 53 } },
    ],
    abracoGlacial: [
      { animation: 'special3', range: { from: 0, to: 8 } },
      { animation: 'special3Grab', range: { from: 9, to: 18 } },
      { animation: 'special3Hold', range: { from: 19, to: 27 } },
      { animation: 'special3Freeze', range: { from: 28, to: 35 } },
      { animation: 'special3Freeze', range: { from: 36, to: 80 }, explicitFrame: 7 },
      { animation: 'special3Finish', range: { from: 81, to: 109 } },
    ],
  },
  animations: {
    idle: animation('idle', 5, -1),
    walk: animation('walk', 7, -1),
    walkBackward: animation('walkBackward', 6, -1),
    jumpNeutral: animation('jumpNeutral', 6, 0),
    jumpForward: animation('jumpForward', 6, 0),
    jumpBackward: animation('jumpBackward', 6, 0),
    fall: animation('fall', 6, 0),
    landing: animation('landing', 8, 0),
    crouch: animation('crouch', 5, 0),
    standingLight: animation('standingLight', 9, 0),
    standingHeavy: animation('standingHeavy', 7, 0),
    forwardLight: animation('forwardLight', 9, 0),
    forwardHeavy: animation('forwardHeavy', 7, 0),
    crouchLight: animation('crouchLight', 9, 0),
    crouchHeavy: animation('crouchHeavy', 7, 0),
    airLightNeutral: animation('airLightNeutral', 9, 0),
    airHeavyNeutral: animation('airHeavyNeutral', 7, 0),
    airLightForward: animation('airLightForward', 9, 0),
    airHeavyForward: animation('airHeavyForward', 7, 0),
    airLightBackward: animation('airLightBackward', 10, 0),
    airHeavyBackward: animation('airHeavyBackward', 7, 0),
    special1: animation('special1', 10, 0),
    special2: animation('special2', 30, 0, { frames: 6, frameSize: GRAB_FRAME_SIZE }),
    special2Grab: animation('special2Grab', 60, 0, { frames: 6, frameSize: GRAB_FRAME_SIZE }),
    special2Hold: animation('special2Hold', 30, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    special2Throw: animation('special2Throw', 48, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    special2Recovery: animation('special2Recovery', 30, 0, { frames: 6, frameSize: GRAB_FRAME_SIZE }),
    special3: animation('special3', 30, 0, { frames: 6, frameSize: GRAB_FRAME_SIZE }),
    special3Grab: animation('special3Grab', 48, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    special3Hold: animation('special3Hold', 48, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    special3Freeze: animation('special3Freeze', 48, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    special3Finish: animation('special3Finish', 30, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    blockStanding: animation('blockStanding', 7, 0),
    blockCrouching: animation('blockCrouching', 7, 0),
    hit: animation('hit', 10, 0),
    knockdown: animation('knockdown', 6, 0),
    wakeUp: animation('wakeUp', 7, 0),
    grabbedFront: animation('grabbedFront', 30, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    grabbedLifted: animation('grabbedLifted', 30, 0, { frames: 8, frameSize: GRAB_FRAME_SIZE }),
    thrown: animation('thrown', 8, 0),
    frozen: animation('frozen', 7, -1),
    knockout: animation('knockout', 5, 0),
    victory: animation('victory', 6, -1),
  },
};
