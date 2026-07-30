import type {
  FighterDefinition,
  HitLevel,
  MoveDefinition,
} from '../types/combat';
import {
  CROUCHING_HURTBOXES,
  STANDING_HURTBOXES,
  STANDARD_ANIMATIONS,
} from './shared';

interface NormalOptions {
  readonly id: string;
  readonly label: string;
  readonly animation: string;
  readonly button: 'light' | 'heavy';
  readonly direction?: 'down' | 'forward';
  readonly state: 'lightAttack' | 'heavyAttack' | 'kickAttack';
  readonly level: HitLevel;
  readonly damage: number;
  readonly totalFrames: number;
  readonly active: readonly [number, number];
  readonly box: readonly [number, number, number, number];
  readonly air?: boolean;
  readonly trajectory?: 'neutral' | 'forward' | 'backward';
  readonly knockdown?: boolean;
}

function normal(options: NormalOptions): MoveDefinition {
  const heavy = options.button === 'heavy';
  return {
    id: options.id,
    label: options.label,
    state: options.state,
    animation: options.animation,
    command: {
      ...(options.direction ? { directions: [options.direction] } : {}),
      buttons: [options.button],
      maxGapFrames: options.direction ? 2 : 1,
      bufferFrames: heavy ? 6 : 5,
      priority: options.air ? (heavy ? 23 : 22) : options.direction ? 15 : 10,
    },
    ...(options.air ? {
      air: true,
      jumpTrajectory: options.trajectory ?? 'neutral',
    } : {}),
    totalFrames: options.totalFrames,
    hitboxes: [{
      range: { from: options.active[0], to: options.active[1] },
      boxes: [{
        id: `noir-${options.id}`,
        x: options.box[0],
        y: options.box[1],
        width: options.box[2],
        height: options.box[3],
        kind: 'strike',
        level: options.level,
        damage: options.damage,
        chipDamage: heavy ? 4 : options.level === 'low' ? 1 : 0,
        hitStun: heavy ? 17 : 11,
        blockStun: heavy ? 11 : 8,
        hitStop: heavy ? 7 : 5,
        priority: heavy ? 3 : 2,
        knockbackX: heavy ? 3.1 : 1.7,
        knockbackY: options.knockdown ? -3.2 : heavy ? -1.2 : 0,
        ...(options.knockdown ? { knockdown: true } : {}),
      }],
    }],
    ...(options.direction === 'down'
      ? { hurtboxes: [{ range: { from: 0, to: options.totalFrames }, boxes: CROUCHING_HURTBOXES }] }
      : {}),
    meterCost: 0,
    meterGainOnHit: heavy ? 11 : 8,
    meterGainOnBlock: heavy ? 4 : 3,
  };
}

/**
 * Noir controla o meio da tela. Reflexo Negro é um parry verdadeiro e curto:
 * lows e throws o vencem; strikes altos/médios/overhead e projéteis comuns
 * disparam a riposta determinística.
 */
export const noirReflexo: FighterDefinition = {
  id: 'noir-reflexo',
  name: 'NOIR REFLEXO',
  archetype: 'COUNTER / ZONER',
  available: true,
  description: 'Controle de espaço, contra-ataques precisos e luz enfraquecedora.',
  abilities: ['Reflexo Negro', 'Quebra-Luz', 'Impacto Solar'],
  stats: {
    maxHealth: 980,
    walkSpeed: 2.65,
    backwardSpeed: 2.55,
    jumpSpeed: 14.4,
    jumpForwardSpeed: 2.85,
    jumpBackwardSpeed: 2.7,
    gravity: 0.92,
    weight: 0.98,
    pushbox: { x: -14, y: -54, width: 28, height: 54 },
  },
  standingHurtboxes: STANDING_HURTBOXES,
  crouchingHurtboxes: CROUCHING_HURTBOXES,
  visualHurtboxes: [
    { x: -20, y: -133, width: 40, height: 41, region: 'head' },
    { x: -29, y: -92, width: 58, height: 92, region: 'body' },
  ],
  animations: STANDARD_ANIMATIONS,
  visual: {
    body: 0x11151b,
    accent: 0x2d9cff,
    shadow: 0x171f37,
    skin: 0xb97855,
  },
  projectiles: {
    quebraLuz: {
      id: 'quebraLuz',
      offsetX: 36,
      offsetY: -50,
      velocityX: 5.8,
      lifeFrames: 96,
      maxActivePerOwner: 1,
      hitbox: {
        id: 'noir-quebra-luz-projectile',
        x: -13, y: -10, width: 38, height: 20,
        kind: 'projectile', level: 'mid', damage: 62, chipDamage: 4,
        hitStun: 18, blockStun: 13, hitStop: 7, priority: 5,
        knockbackX: 3.2, knockbackY: -1,
        offensiveDebuffFrames: 105,
        offensiveDebuffMultiplier: 0.88,
      },
    },
    impactoSolar: {
      id: 'impactoSolar',
      offsetX: 42,
      offsetY: -56,
      velocityX: 4.4,
      lifeFrames: 120,
      armingFrames: 3,
      maxActivePerOwner: 1,
      hitbox: {
        id: 'noir-impacto-solar-projectile',
        x: -22, y: -22, width: 52, height: 44,
        kind: 'projectile', level: 'mid', damage: 232, chipDamage: 18,
        hitStun: 31, blockStun: 20, hitStop: 13, priority: 10,
        knockbackX: 7.2, knockbackY: -7.4, knockdown: true,
      },
    },
  },
  moves: {
    lightPunch: normal({
      id: 'lightPunch', label: 'Toque de precisão', animation: 'standingLight',
      button: 'light', state: 'lightAttack', level: 'high', damage: 40,
      totalFrames: 14, active: [4, 6], box: [10, -56, 34, 17],
    }),
    heavyPunch: normal({
      id: 'heavyPunch', label: 'Cruzado prismático', animation: 'standingHeavy',
      button: 'heavy', state: 'heavyAttack', level: 'mid', damage: 79,
      totalFrames: 26, active: [9, 12], box: [8, -62, 45, 24],
    }),
    lowKick: normal({
      id: 'lowKick', label: 'Chute baixo', animation: 'crouchLight',
      button: 'light', direction: 'down', state: 'kickAttack', level: 'low',
      damage: 46, totalFrames: 19, active: [6, 9], box: [7, -19, 45, 15],
    }),
    forwardLight: normal({
      id: 'forwardLight', label: 'Palma de alcance', animation: 'forwardLight',
      button: 'light', direction: 'forward', state: 'lightAttack', level: 'mid',
      damage: 51, totalFrames: 18, active: [6, 9], box: [12, -56, 43, 20],
    }),
    sweep: normal({
      id: 'sweep', label: 'Rasteira eclipse', animation: 'crouchHeavy',
      button: 'heavy', direction: 'down', state: 'kickAttack', level: 'low',
      damage: 81, totalFrames: 29, active: [10, 14], box: [5, -17, 53, 17],
      knockdown: true,
    }),
    forwardHeavy: normal({
      id: 'forwardHeavy', label: 'Arco refletido', animation: 'forwardHeavy',
      button: 'heavy', direction: 'forward', state: 'heavyAttack', level: 'overhead',
      damage: 90, totalFrames: 31, active: [11, 15], box: [7, -78, 53, 30],
    }),
    jumpLightNeutral: normal({
      id: 'jumpLightNeutral', label: 'Soco aéreo', animation: 'airLightNeutral',
      button: 'light', state: 'lightAttack', level: 'overhead', damage: 49,
      totalFrames: 19, active: [5, 13], box: [7, -45, 38, 28],
      air: true, trajectory: 'neutral',
    }),
    jumpHeavyNeutral: normal({
      id: 'jumpHeavyNeutral', label: 'Chute aéreo', animation: 'airHeavyNeutral',
      button: 'heavy', state: 'heavyAttack', level: 'overhead', damage: 84,
      totalFrames: 23, active: [7, 15], box: [4, -50, 49, 33],
      air: true, trajectory: 'neutral',
    }),
    jumpLightForward: normal({
      id: 'jumpLightForward', label: 'Soco aéreo à frente', animation: 'airLightForward',
      button: 'light', state: 'lightAttack', level: 'overhead', damage: 51,
      totalFrames: 19, active: [5, 13], box: [13, -43, 40, 29],
      air: true, trajectory: 'forward',
    }),
    jumpHeavyForward: normal({
      id: 'jumpHeavyForward', label: 'Chute aéreo à frente', animation: 'airHeavyForward',
      button: 'heavy', state: 'heavyAttack', level: 'overhead', damage: 87,
      totalFrames: 23, active: [7, 15], box: [11, -47, 51, 34],
      air: true, trajectory: 'forward',
    }),
    jumpLightBackward: normal({
      id: 'jumpLightBackward', label: 'Soco aéreo recuando', animation: 'airLightBackward',
      button: 'light', state: 'lightAttack', level: 'overhead', damage: 47,
      totalFrames: 19, active: [5, 13], box: [1, -43, 37, 28],
      air: true, trajectory: 'backward',
    }),
    jumpHeavyBackward: normal({
      id: 'jumpHeavyBackward', label: 'Chute aéreo recuando', animation: 'airHeavyBackward',
      button: 'heavy', state: 'heavyAttack', level: 'overhead', damage: 80,
      totalFrames: 23, active: [7, 15], box: [-1, -49, 47, 33],
      air: true, trajectory: 'backward',
    }),
    reflexoNegro: {
      id: 'reflexoNegro',
      label: 'Reflexo Negro',
      state: 'specialAttack',
      animation: 'special1',
      command: {
        directions: ['forward', 'down', 'downForward'],
        buttons: ['special'],
        maxGapFrames: 8,
        bufferFrames: 10,
        priority: 94,
      },
      totalFrames: 30,
      hitboxes: [],
      events: [{ frame: 5, type: 'grantParry', durationFrames: 6, riposteDamage: 100 }],
      meterCost: 0,
      meterGainOnHit: 0,
      meterGainOnBlock: 0,
      lockFacing: true,
    },
    quebraLuz: {
      id: 'quebraLuz',
      label: 'Quebra-Luz',
      state: 'specialAttack',
      animation: 'special2',
      command: {
        directions: ['down', 'downForward', 'forward'],
        buttons: ['special'],
        maxGapFrames: 8,
        bufferFrames: 10,
        priority: 90,
      },
      totalFrames: 38,
      hitboxes: [],
      events: [{ frame: 10, type: 'spawnProjectile', projectileId: 'quebraLuz' }],
      meterCost: 0,
      meterGainOnHit: 13,
      meterGainOnBlock: 5,
      lockFacing: true,
    },
    impactoSolar: {
      id: 'impactoSolar',
      label: 'Impacto Solar',
      state: 'specialAttack',
      animation: 'special3',
      command: {
        directions: ['down', 'downBack', 'back'],
        buttons: ['special'],
        maxGapFrames: 8,
        bufferFrames: 10,
        priority: 96,
      },
      totalFrames: 58,
      hitboxes: [],
      events: [{ frame: 15, type: 'spawnProjectile', projectileId: 'impactoSolar' }],
      meterCost: 100,
      meterGainOnHit: 0,
      meterGainOnBlock: 0,
      isSuper: true,
      cinematic: 'freeze',
      lockFacing: true,
    },
  },
};
