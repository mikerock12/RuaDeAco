import { MAX_METER } from '../config/gameConfig';

export interface DamageOptions {
  readonly baseDamage: number;
  readonly chipDamage?: number;
  readonly blocked?: boolean;
  readonly comboHits?: number;
  readonly defenseMultiplier?: number;
}

export function calculateDamage(options: DamageOptions): number {
  const {
    baseDamage,
    chipDamage = 0,
    blocked = false,
    comboHits = 1,
    defenseMultiplier = 1,
  } = options;
  const source = blocked ? chipDamage : baseDamage;
  const scaling = blocked ? 1 : Math.max(0.35, 1 - Math.max(0, comboHits - 1) * 0.08);
  return Math.max(0, Math.round(source * scaling * Math.max(0, defenseMultiplier)));
}

export function applyEnergy(current: number, delta: number, maximum = MAX_METER): number {
  return Math.max(0, Math.min(maximum, current + delta));
}

export function canSpendEnergy(current: number, cost: number): boolean {
  return cost >= 0 && current >= cost;
}

export function calculateHitStun(baseFrames: number, counterHit = false, comboHits = 1): number {
  const counterBonus = counterHit ? 3 : 0;
  const comboReduction = Math.min(4, Math.max(0, comboHits - 1));
  return Math.max(0, Math.round(baseFrames + counterBonus - comboReduction));
}

export function applyDamageToHealth(health: number, damage: number): number {
  return Math.max(0, health - Math.max(0, damage));
}
