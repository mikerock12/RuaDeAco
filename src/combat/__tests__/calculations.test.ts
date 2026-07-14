import { describe, expect, it } from 'vitest';
import {
  applyDamageToHealth,
  applyEnergy,
  calculateDamage,
  calculateHitStun,
  canSpendEnergy,
} from '../calculations';

describe('cálculos de dano', () => {
  it('aplica dano base e limita a vida em zero', () => {
    expect(calculateDamage({ baseDamage: 120 })).toBe(120);
    expect(applyDamageToHealth(80, 120)).toBe(0);
  });

  it('usa chip damage ao defender', () => {
    expect(calculateDamage({ baseDamage: 120, chipDamage: 9, blocked: true })).toBe(9);
  });

  it('aplica scaling de combo sem cair abaixo de 35%', () => {
    expect(calculateDamage({ baseDamage: 100, comboHits: 3 })).toBe(84);
    expect(calculateDamage({ baseDamage: 100, comboHits: 20 })).toBe(35);
  });
});

describe('energia especial', () => {
  it('mantém a energia entre zero e a barra máxima', () => {
    expect(applyEnergy(95, 20)).toBe(100);
    expect(applyEnergy(5, -20)).toBe(0);
  });

  it('só permite super com energia suficiente', () => {
    expect(canSpendEnergy(99, 100)).toBe(false);
    expect(canSpendEnergy(100, 100)).toBe(true);
  });
});

describe('hit stun', () => {
  it('preserva a duração configurada no primeiro golpe', () => {
    expect(calculateHitStun(18)).toBe(18);
  });

  it('adiciona bônus de counter e reduz combos longos sem valores negativos', () => {
    expect(calculateHitStun(18, true, 1)).toBe(21);
    expect(calculateHitStun(2, false, 20)).toBe(0);
  });
});
