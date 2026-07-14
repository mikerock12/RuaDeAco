import { describe, expect, it } from 'vitest';
import { CpuController } from '../../ai/CpuController';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import type { InputAction, InputFrame } from '../../types/combat';
import { CombatWorld } from '../CombatWorld';

const input = (held: readonly InputAction[] = [], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});
const empty = input();

const enterFight = (world: CombatWorld): void => {
  for (let frame = 0; frame < 105; frame += 1) world.step(empty, empty);
};

const approach = (world: CombatWorld): void => {
  for (let frame = 0; frame < 70; frame += 1) world.step(input(['right']), empty);
};

const quarterCircle = (world: CombatWorld, buttons: readonly InputAction[]): void => {
  for (let frame = 0; frame < 3; frame += 1) world.step(input(['down']), empty);
  for (let frame = 0; frame < 3; frame += 1) world.step(input(['down', 'right']), empty);
  for (let frame = 0; frame < 3; frame += 1) world.step(input(['right']), empty);
  world.step(input(['right', ...buttons], buttons), empty);
};

describe('integração do mundo de combate', () => {
  it('resolve dano e defesa com caixas próprias', () => {
    const strikeWorld = new CombatWorld(rafaMare, gutoBarba, 'cpu');
    enterFight(strikeWorld);
    approach(strikeWorld);
    const healthBefore = strikeWorld.fighters[1].health;
    strikeWorld.step(input(['light'], ['light']), empty);
    for (let frame = 0; frame < 22; frame += 1) strikeWorld.step(empty, empty);
    expect(strikeWorld.fighters[1].health < healthBefore).toBe(true);

    const blockWorld = new CombatWorld(rafaMare, gutoBarba, 'cpu');
    enterFight(blockWorld);
    approach(blockWorld);
    const blockedHealth = blockWorld.fighters[1].health;
    const blockedX = blockWorld.fighters[1].x;
    blockWorld.step(input(['light'], ['light']), input(['block']));
    for (let frame = 0; frame < 12; frame += 1) blockWorld.step(empty, input(['block']));
    expect(blockWorld.fighters[1].health).toBe(blockedHealth);
    expect(blockWorld.fighters[1].x > blockedX).toBe(true);
    expect(blockWorld.drainEvents().some((event) => event.type === 'blocked')).toBe(true);
  });

  it('executa projétil e super a partir do command buffer', () => {
    const specialWorld = new CombatWorld(rafaMare, gutoBarba, 'training');
    enterFight(specialWorld);
    quarterCircle(specialWorld, ['special']);
    for (let frame = 0; frame < 14; frame += 1) specialWorld.step(empty, empty);
    expect(specialWorld.snapshot().projectiles.length > 0).toBe(true);

    const superWorld = new CombatWorld(rafaMare, gutoBarba, 'training');
    enterFight(superWorld);
    quarterCircle(superWorld, ['heavy', 'special']);
    expect(superWorld.fighters[0].currentMove?.id).toBe('chuteRessaca');
    expect(superWorld.fighters[0].meter).toBe(100);
  });

  it('concede a armadura configurada da Muralha Norte', () => {
    const world = new CombatWorld(gutoBarba, rafaMare, 'training');
    enterFight(world);
    world.step(input(['special'], ['special']), empty);
    for (let frame = 0; frame < 4; frame += 1) world.step(empty, empty);
    expect(world.fighters[0].armorHits).toBe(1);
  });

  it('credita meter simetricamente em trades de mesma prioridade', () => {
    const world = new CombatWorld(rafaMare, rafaMare, 'versus');
    enterFight(world);
    for (let frame = 0; frame < 42; frame += 1) {
      world.step(input(['right']), input(['left']));
    }
    world.step(input(['light'], ['light']), input(['light'], ['light']));
    for (let frame = 0; frame < 8; frame += 1) world.step(empty, empty);
    expect(world.fighters[0].health).toBe(world.fighters[1].health);
    expect(world.fighters[0].meter).toBe(world.fighters[1].meter);
    expect(world.fighters[0].meter > 0).toBe(true);
  });

  it('compara percentual de vida no timeout e repete empates', () => {
    const percentageWorld = new CombatWorld(rafaMare, gutoBarba, 'versus');
    enterFight(percentageWorld);
    percentageWorld.fighters[1].health = 1001;
    percentageWorld.timeFrames = 1;
    percentageWorld.step(empty, empty);
    expect(percentageWorld.fighters[0].state).toBe('victory');

    const drawWorld = new CombatWorld(rafaMare, gutoBarba, 'versus');
    enterFight(drawWorld);
    drawWorld.timeFrames = 1;
    drawWorld.step(empty, empty);
    expect(drawWorld.snapshot().roundDraw).toBe(true);
    expect(drawWorld.snapshot().roundWins).toEqual([0, 0]);
  });

  it('mantém atraso mínimo de reação até na CPU difícil', () => {
    const world = new CombatWorld(rafaMare, gutoBarba, 'cpu');
    const cpu = new CpuController(gutoBarba, 1, 'hard', () => 0.5);
    for (let frame = 0; frame < 6; frame += 1) {
      expect(cpu.sample(world.snapshot()).held.size).toBe(0);
    }
  });
});
