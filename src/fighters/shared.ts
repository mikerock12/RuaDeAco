import type {
  AnimationDefinition,
  FighterDefinition,
  FighterId,
  FighterVisualDefinition,
  HurtboxDefinition,
  MoveDefinition,
} from '../types/combat';

export const STANDARD_ANIMATIONS: readonly AnimationDefinition[] = [
  { key: 'idle', frames: 4, frameDuration: 10, loop: true },
  { key: 'walk', frames: 4, frameDuration: 6, loop: true },
  { key: 'jump', frames: 2, frameDuration: 8, loop: false },
  { key: 'crouch', frames: 1, frameDuration: 1, loop: false },
  { key: 'attack', frames: 4, frameDuration: 4, loop: false },
  { key: 'hit', frames: 2, frameDuration: 5, loop: false },
  { key: 'knockdown', frames: 3, frameDuration: 8, loop: false },
  { key: 'victory', frames: 4, frameDuration: 8, loop: true },
];

export const STANDING_HURTBOXES: readonly HurtboxDefinition[] = [
  { x: -11, y: -68, width: 22, height: 22, region: 'head' },
  { x: -15, y: -47, width: 30, height: 30, region: 'body' },
  { x: -13, y: -18, width: 26, height: 18, region: 'legs' },
];

export const CROUCHING_HURTBOXES: readonly HurtboxDefinition[] = [
  { x: -12, y: -43, width: 24, height: 19, region: 'head' },
  { x: -18, y: -28, width: 36, height: 24, region: 'body' },
];

export const emptyMove: MoveDefinition = {
  id: 'unavailable',
  label: 'Em desenvolvimento',
  state: 'specialAttack',
  animation: 'attack',
  command: { buttons: ['special'], maxGapFrames: 1, bufferFrames: 1, priority: 1 },
  totalFrames: 1,
  hitboxes: [],
  meterCost: 0,
  meterGainOnHit: 0,
  meterGainOnBlock: 0,
};

export function lockedFighter(
  id: FighterId,
  name: string,
  archetype: string,
  abilities: readonly [string, string, string],
  visual: FighterVisualDefinition,
): FighterDefinition {
  return {
    id,
    name,
    archetype,
    available: false,
    description: 'Lutador em preparação para uma futura atualização.',
    abilities,
    stats: {
      maxHealth: 1000,
      walkSpeed: 2,
      backwardSpeed: 1.7,
      jumpSpeed: 14,
      jumpForwardSpeed: 2.4,
      jumpBackwardSpeed: 2.1,
      gravity: 0.84,
      weight: 1,
      pushbox: { x: -15, y: -52, width: 30, height: 52 },
    },
    standingHurtboxes: STANDING_HURTBOXES,
    crouchingHurtboxes: CROUCHING_HURTBOXES,
    moves: { unavailable: emptyMove },
    animations: STANDARD_ANIMATIONS,
    visual,
  };
}
