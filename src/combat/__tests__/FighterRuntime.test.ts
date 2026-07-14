import { describe, expect, it } from 'vitest';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import type { HitboxDefinition, InputAction, InputFrame } from '../../types/combat';
import { FighterRuntime } from '../FighterRuntime';

const input = (held: readonly InputAction[] = [], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});

const blockHit: HitboxDefinition = {
  id: 'teste-block',
  x: 0,
  y: -40,
  width: 30,
  height: 40,
  kind: 'strike',
  level: 'mid',
  damage: 20,
  chipDamage: 2,
  hitStun: 8,
  blockStun: 6,
  hitStop: 0,
  priority: 1,
  knockbackX: 2,
  knockbackY: 0,
};

const throwHit: HitboxDefinition = {
  id: 'teste-throw',
  x: 0,
  y: -40,
  width: 30,
  height: 40,
  kind: 'throw',
  level: 'mid',
  damage: 10,
  chipDamage: 0,
  hitStun: 1,
  blockStun: 0,
  hitStop: 0,
  priority: 1,
  knockbackX: 0,
  knockbackY: 0,
  knockdown: true,
};

describe('estados defensivos do lutador', () => {
  it('não permite bloquear durante um ataque ativo', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['light'], ['light']), 1, 400);
    fighter.finishFrame();
    fighter.beginFrame(input(['block']), 2, 400);
    expect(fighter.currentMove?.id).toBe('lightPunch');
    expect(fighter.isBlocking('mid', 'strike')).toBe(false);
  });

  it('permite alternar entre guarda alta e baixa durante block stun', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['block']), 1, 400);
    fighter.applyHit(blockHit, -1, true, 1, false);
    fighter.finishFrame();
    fighter.beginFrame(input(['block', 'down']), 2, 400);
    expect(fighter.state).toBe('blockCrouching');
    expect(fighter.isBlocking('low', 'strike')).toBe(true);
    expect(fighter.isBlocking('overhead', 'strike')).toBe(false);
  });

  it('limpa armadura quando Muralha Norte é interrompida por throw', () => {
    const fighter = new FighterRuntime(gutoBarba, 200, 1);
    fighter.beginFrame(input(['special'], ['special']), 1, 400);
    fighter.consumeMoveEvents();
    fighter.finishFrame();
    for (let frameNumber = 2; frameNumber <= 5; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.consumeMoveEvents();
      fighter.finishFrame();
    }
    expect(fighter.armorHits).toBe(1);
    fighter.applyHit(throwHit, -1, false, 1, false);
    expect(fighter.armorHits).toBe(0);
  });

  it('protege knockdown e wake-up sem permitir ataque invencível', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.applyHit(throwHit, -1, false, 1, false);
    fighter.finishFrame();
    expect(fighter.state).toBe('knockdown');
    expect(fighter.getHurtboxes().length).toBe(0);

    for (let frameNumber = 1; frameNumber <= 42; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
    }
    expect(fighter.state).toBe('wakeUp');
    expect(fighter.getHurtboxes().length).toBe(0);

    for (let frameNumber = 43; frameNumber <= 64; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
    }
    expect(fighter.state).toBe('idle');
    fighter.beginFrame(input(), 65, 400);
    expect(fighter.getHurtboxes().length > 0).toBe(true);
  });
});
