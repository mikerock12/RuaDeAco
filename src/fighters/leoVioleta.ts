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
        id: `leo-${options.id}`,
        x: options.box[0],
        y: options.box[1],
        width: options.box[2],
        height: options.box[3],
        kind: 'strike',
        level: options.level,
        damage: options.damage,
        chipDamage: heavy ? 4 : options.level === 'low' ? 1 : 0,
        hitStun: heavy ? 18 : 12,
        blockStun: heavy ? 12 : 8,
        hitStop: heavy ? 8 : 5,
        priority: heavy ? 3 : 2,
        knockbackX: heavy ? 3.4 : 1.8,
        knockbackY: options.knockdown ? -3.2 : heavy ? -1.4 : 0,
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
 * Léo é um brawler de pressão: alcance curto/médio, vantagem de stun e uma
 * corrida de ombro comprometida. Olhar Frio representa pressão mental, sem
 * congelar literalmente a simulação.
 */
export const leoVioleta: FighterDefinition = {
  id: 'leo-violeta',
  name: 'LÉO VIOLETA',
  archetype: 'PRESSURE / BRAWLER',
  available: true,
  description: 'Pressão de curta distância, golpes firmes e sequências sufocantes.',
  abilities: ['Olhar Frio', 'Impacto Sombrio', 'Pressão Violeta'],
  stats: {
    maxHealth: 1050,
    walkSpeed: 2.9,
    backwardSpeed: 2.3,
    jumpSpeed: 14.4,
    jumpForwardSpeed: 2.95,
    jumpBackwardSpeed: 2.55,
    gravity: 0.94,
    weight: 1.05,
    pushbox: { x: -15, y: -56, width: 30, height: 56 },
  },
  standingHurtboxes: STANDING_HURTBOXES,
  crouchingHurtboxes: CROUCHING_HURTBOXES,
  animations: STANDARD_ANIMATIONS,
  visual: {
    body: 0x17151c,
    accent: 0x8c4fd6,
    shadow: 0x2a1742,
    skin: 0xc98261,
  },
  projectiles: {
    olharFrio: {
      id: 'olharFrio',
      offsetX: 48,
      offsetY: -78,
      velocityX: 5.2,
      lifeFrames: 42,
      maxActivePerOwner: 1,
      hitbox: {
        id: 'leo-olhar-frio-projectile',
        x: -16,
        // Núcleo alinhado ao código violeta visível (alpha local -10..9).
        y: -9,
        width: 36,
        height: 18,
        kind: 'projectile',
        level: 'mid',
        // Projétil horizontal de controle de chão: o salto é uma evasão deliberada.
        airAvoidable: true,
        damage: 40,
        chipDamage: 4,
        hitStun: 23,
        blockStun: 18,
        hitStop: 7,
        priority: 5,
        knockbackX: 1.1,
        knockbackY: 0,
      },
    },
  },
  moves: {
    lightPunch: normal({
      id: 'lightPunch', label: 'Direto curto', animation: 'standingLight',
      button: 'light', state: 'lightAttack', level: 'high', damage: 44,
      totalFrames: 14, active: [4, 6], box: [10, -56, 34, 17],
    }),
    heavyPunch: normal({
      id: 'heavyPunch', label: 'Cruzado violeta', animation: 'standingHeavy',
      button: 'heavy', state: 'heavyAttack', level: 'mid', damage: 84,
      totalFrames: 26, active: [9, 12], box: [8, -63, 45, 25],
    }),
    lowKick: normal({
      id: 'lowKick', label: 'Chute baixo', animation: 'crouchLight',
      button: 'light', direction: 'down', state: 'kickAttack', level: 'low',
      damage: 49, totalFrames: 19, active: [6, 9], box: [7, -19, 45, 15],
    }),
    forwardLight: normal({
      id: 'forwardLight', label: 'Passo de pressão', animation: 'forwardLight',
      button: 'light', direction: 'forward', state: 'lightAttack', level: 'mid',
      damage: 54, totalFrames: 18, active: [6, 9], box: [12, -55, 40, 19],
    }),
    sweep: normal({
      id: 'sweep', label: 'Rasteira de aço', animation: 'crouchHeavy',
      button: 'heavy', direction: 'down', state: 'kickAttack', level: 'low',
      damage: 86, totalFrames: 29, active: [10, 14], box: [5, -17, 52, 17],
      knockdown: true,
    }),
    forwardHeavy: normal({
      id: 'forwardHeavy', label: 'Martelo frontal', animation: 'forwardHeavy',
      button: 'heavy', direction: 'forward', state: 'heavyAttack', level: 'overhead',
      damage: 96, totalFrames: 31, active: [11, 15], box: [7, -78, 52, 30],
    }),
    jumpLightNeutral: normal({
      id: 'jumpLightNeutral', label: 'Soco aéreo', animation: 'airLightNeutral',
      button: 'light', state: 'lightAttack', level: 'overhead', damage: 51,
      totalFrames: 19, active: [5, 13], box: [7, -45, 38, 28],
      air: true, trajectory: 'neutral',
    }),
    jumpHeavyNeutral: normal({
      id: 'jumpHeavyNeutral', label: 'Chute aéreo', animation: 'airHeavyNeutral',
      button: 'heavy', state: 'heavyAttack', level: 'overhead', damage: 88,
      totalFrames: 23, active: [7, 15], box: [4, -50, 49, 33],
      air: true, trajectory: 'neutral',
    }),
    jumpLightForward: normal({
      id: 'jumpLightForward', label: 'Soco aéreo à frente', animation: 'airLightForward',
      button: 'light', state: 'lightAttack', level: 'overhead', damage: 54,
      totalFrames: 19, active: [5, 13], box: [13, -43, 40, 29],
      air: true, trajectory: 'forward',
    }),
    jumpHeavyForward: normal({
      id: 'jumpHeavyForward', label: 'Joelhada à frente', animation: 'airHeavyForward',
      button: 'heavy', state: 'heavyAttack', level: 'overhead', damage: 92,
      totalFrames: 23, active: [7, 15], box: [11, -47, 51, 34],
      air: true, trajectory: 'forward',
    }),
    jumpLightBackward: normal({
      id: 'jumpLightBackward', label: 'Soco aéreo recuando', animation: 'airLightBackward',
      button: 'light', state: 'lightAttack', level: 'overhead', damage: 48,
      totalFrames: 19, active: [5, 13], box: [1, -43, 37, 28],
      air: true, trajectory: 'backward',
    }),
    jumpHeavyBackward: normal({
      id: 'jumpHeavyBackward', label: 'Chute aéreo recuando', animation: 'airHeavyBackward',
      button: 'heavy', state: 'heavyAttack', level: 'overhead', damage: 84,
      totalFrames: 23, active: [7, 15], box: [-1, -49, 47, 33],
      air: true, trajectory: 'backward',
    }),
    olharFrio: {
      id: 'olharFrio',
      label: 'Olhar Frio',
      state: 'specialAttack',
      animation: 'special1',
      command: {
        directions: ['down', 'downForward', 'forward'],
        buttons: ['special'],
        maxGapFrames: 8,
        bufferFrames: 10,
        priority: 90,
      },
      totalFrames: 30,
      hitboxes: [],
      events: [{ frame: 9, type: 'spawnProjectile', projectileId: 'olharFrio' }],
      meterCost: 0,
      meterGainOnHit: 13,
      meterGainOnBlock: 8,
      lockFacing: true,
    },
    impactoSombrio: {
      id: 'impactoSombrio',
      label: 'Impacto Sombrio',
      state: 'specialAttack',
      animation: 'special2',
      command: {
        directions: ['forward', 'down', 'downForward'],
        buttons: ['special'],
        maxGapFrames: 8,
        bufferFrames: 10,
        priority: 92,
      },
      totalFrames: 42,
      movement: [{ range: { from: 5, to: 13 }, velocityX: 6.1 }],
      hitboxes: [{
        range: { from: 12, to: 16 },
        boxes: [{
          id: 'leo-impacto-sombrio', x: 3, y: -70, width: 62, height: 60,
          kind: 'strike', level: 'mid', damage: 116, chipDamage: 8,
          hitStun: 24, blockStun: 14, hitStop: 10, priority: 7,
          knockbackX: 5.6, knockbackY: -5.2, knockdown: true,
        }],
      }],
      meterCost: 0,
      meterGainOnHit: 15,
      meterGainOnBlock: 6,
      lockFacing: true,
    },
    pressaoVioleta: {
      id: 'pressaoVioleta',
      label: 'Pressão Violeta',
      state: 'specialAttack',
      animation: 'special3',
      command: {
        directions: ['down', 'downBack', 'back'],
        buttons: ['special'],
        maxGapFrames: 8,
        bufferFrames: 10,
        priority: 96,
      },
      totalFrames: 62,
      movement: [{ range: { from: 10, to: 39 }, velocityX: 1.8 }],
      hitboxes: [
        { range: { from: 14, to: 16 }, boxes: [{ id: 'leo-pressao-1', x: 3, y: -68, width: 60, height: 48, kind: 'strike', level: 'mid', damage: 42, chipDamage: 4, hitStun: 14, blockStun: 10, hitStop: 5, priority: 8, knockbackX: 0.5, knockbackY: 0 }] },
        { range: { from: 20, to: 22 }, boxes: [{ id: 'leo-pressao-2', x: -2, y: -54, width: 64, height: 48, kind: 'strike', level: 'mid', damage: 42, chipDamage: 4, hitStun: 14, blockStun: 10, hitStop: 5, priority: 8, knockbackX: 0.6, knockbackY: 0 }] },
        { range: { from: 26, to: 28 }, boxes: [{ id: 'leo-pressao-3', x: 2, y: -75, width: 66, height: 52, kind: 'strike', level: 'mid', damage: 42, chipDamage: 4, hitStun: 14, blockStun: 10, hitStop: 5, priority: 8, knockbackX: 0.7, knockbackY: -1 }] },
        { range: { from: 32, to: 34 }, boxes: [{ id: 'leo-pressao-4', x: -4, y: -58, width: 69, height: 53, kind: 'strike', level: 'mid', damage: 42, chipDamage: 4, hitStun: 14, blockStun: 10, hitStop: 5, priority: 8, knockbackX: 0.8, knockbackY: -1 }] },
        { range: { from: 39, to: 43 }, boxes: [{ id: 'leo-pressao-5', x: 5, y: -80, width: 74, height: 60, kind: 'strike', level: 'overhead', damage: 62, chipDamage: 8, hitStun: 29, blockStun: 18, hitStop: 12, priority: 10, knockbackX: 6.2, knockbackY: -7.5, knockdown: true }] },
      ],
      meterCost: 100,
      meterGainOnHit: 0,
      meterGainOnBlock: 0,
      isSuper: true,
      cinematic: 'rush',
      lockFacing: true,
    },
  },
};
