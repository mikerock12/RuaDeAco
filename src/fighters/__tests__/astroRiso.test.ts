import { describe, expect, it } from 'vitest';
import { CombatWorld } from '../../combat/CombatWorld';
import { FighterRuntime } from '../../combat/FighterRuntime';
import type { InputAction, InputFrame, MoveDefinition } from '../../types/combat';
import { astroRiso } from '../astroRiso';
import { gutoBarba } from '../gutoBarba';
import { AVAILABLE_FIGHTERS } from '../index';
import { astroRisoSpriteAsset, FIGHTER_SPRITE_ASSETS } from '../visual';

const input = (held: readonly InputAction[] = [], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});

const empty = input();

function enterFight(world: CombatWorld): void {
  for (let frame = 0; frame < 105; frame += 1) world.step(empty, empty);
  world.drainEvents();
}

function hitIds(move: MoveDefinition): string[] {
  return move.hitboxes.flatMap(({ boxes }) => boxes.map(({ id }) => id));
}

function hitDamage(move: MoveDefinition): number {
  return move.hitboxes.flatMap(({ boxes }) => boxes).reduce((total, hitbox) => total + hitbox.damage, 0);
}

describe('Astro Riso', () => {
  it('está disponível com o arquétipo rápido e sem passiva', () => {
    expect(astroRiso.available).toBe(true);
    expect(AVAILABLE_FIGHTERS).toContain(astroRiso);
    expect(astroRiso.stats).toMatchObject({
      maxHealth: 930,
      walkSpeed: 3.35,
      backwardSpeed: 2.75,
      jumpSpeed: 15.4,
      weight: 0.84,
    });
    expect(astroRiso.passive).toBeUndefined();
  });

  it('possui pacote visual completo, plano e com efeitos separados do corpo', () => {
    expect(FIGHTER_SPRITE_ASSETS).toContain(astroRisoSpriteAsset);
    expect(astroRisoSpriteAsset).toMatchObject({
      fighterId: 'astro-riso',
      frameWidth: 256,
      frameHeight: 256,
      origin: { x: 0.5, y: 1 },
      scale: 1,
      visualOffset: { x: 0, y: 6 },
    });
    expect(Object.values(astroRisoSpriteAsset.animations)).toHaveLength(35);
    expect(astroRisoSpriteAsset.effects).toHaveLength(3);
    expect(astroRisoSpriteAsset.effects.map(({ moveId }) => moveId)).toEqual([
      'sorrisoRelampago',
      'rajadaNeon',
      'astroGiro',
    ]);
    expect(astroRisoSpriteAsset.effects.every(({ usage, repeat }) => usage === 'attached' && repeat === 0))
      .toBe(true);
  });

  it('oferece seis normais terrestres, seis aéreos e três especiais', () => {
    const moves = Object.values(astroRiso.moves);
    expect(moves.filter((move) => !move.air && move.state !== 'specialAttack')).toHaveLength(6);
    expect(moves.filter((move) => move.air)).toHaveLength(6);
    expect(moves.filter((move) => move.state === 'specialAttack')).toHaveLength(3);
    expect(new Set(moves.map(({ id }) => id)).size).toBe(moves.length);
  });

  it('configura os especiais com dano, impactos e energia planejados', () => {
    const sorriso = astroRiso.moves.sorrisoRelampago!;
    expect(sorriso).toMatchObject({ meterCost: 0, lockFacing: true });
    expect(hitIds(sorriso)).toEqual(['astro-sorriso']);
    expect(hitDamage(sorriso)).toBe(112);

    const rajada = astroRiso.moves.rajadaNeon!;
    expect(hitIds(rajada)).toEqual([
      'astro-rajada-1',
      'astro-rajada-2',
      'astro-rajada-3',
      'astro-rajada-4',
    ]);
    expect(hitDamage(rajada)).toBe(140);

    const giro = astroRiso.moves.astroGiro!;
    expect(giro).toMatchObject({ meterCost: 100, isSuper: true, cinematic: 'rush', lockFacing: true });
    expect(hitIds(giro)).toHaveLength(5);
    expect(new Set(hitIds(giro)).size).toBe(5);
    expect(hitDamage(giro)).toBe(245);
    expect(giro.hitboxes.at(-1)?.boxes[0]?.knockdown).toBe(true);
  });

  it('consome os 100 de energia do Astro Giro somente uma vez', () => {
    const fighter = new FighterRuntime(astroRiso, 220, 1);
    fighter.forceMeter(100);
    fighter.beginFrame(input(['down']), 1, 440);
    fighter.finishFrame();
    fighter.beginFrame(input(['down', 'left']), 2, 440);
    fighter.finishFrame();
    fighter.beginFrame(input(['left', 'special'], ['special']), 3, 440);
    expect(fighter.currentMove?.id).toBe('astroGiro');
    expect(fighter.meter).toBe(0);
    for (let frame = 4; frame < 15; frame += 1) {
      fighter.finishFrame();
      fighter.beginFrame(empty, frame, 440);
      expect(fighter.meter).toBe(0);
    }
  });

  it.each([
    ['rajadaNeon', 4],
    ['astroGiro', 5],
  ] as const)('registra exatamente os impactos de %s sem duplicar', (moveId, expectedHits) => {
    const world = new CombatWorld(astroRiso, gutoBarba, 'training');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 338;
    if (moveId === 'rajadaNeon') {
      world.step(input(['down']), empty);
      world.step(input(['down', 'right']), empty);
      world.step(input(['right', 'special'], ['special']), empty);
    } else {
      world.fighters[0].forceMeter(100);
      world.step(input(['down']), empty);
      world.step(input(['down', 'left']), empty);
      world.step(input(['left', 'special'], ['special']), empty);
    }
    for (let frame = 0; frame < 140; frame += 1) world.step(empty, empty);
    const hits = world.drainEvents().filter((event) => event.type === 'hit' && event.moveId === moveId);
    expect(hits).toHaveLength(expectedHits);
  });

  it('continua uma vítima separada nos estados do Gancho do Urso', () => {
    const world = new CombatWorld(gutoBarba, astroRiso, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 330;
    const states = new Set<string>();
    world.step(input(['right', 'special'], ['special']), empty);
    for (let frame = 0; frame < 90; frame += 1) {
      world.step(empty, empty);
      const [attacker, victim] = world.snapshot().fighters;
      states.add(victim.state);
      if (victim.grabbedBy) {
        expect(victim.grabbedBy).toBe(attacker.id);
        expect(attacker.grabbedBy).toBeNull();
      }
    }
    expect(states).toContain('grabbedFront');
    expect(states).toContain('grabbedLifted');
    expect(states).toContain('thrown');
  });

  it('usa seus próprios estados de vítima no Abraço Glacial', () => {
    const world = new CombatWorld(gutoBarba, astroRiso, 'training');
    enterFight(world);
    world.fighters[0].forceMeter(100);
    world.fighters[0].x = 300;
    world.fighters[1].x = 332;
    const states = new Set<string>();
    world.step(input(['down', 'special'], ['special']), empty);
    for (let frame = 0; frame < 180; frame += 1) {
      world.step(empty, empty);
      states.add(world.snapshot().fighters[1].state);
    }
    expect(states).toContain('grabbedFront');
    expect(states).toContain('grabbedLifted');
    expect(states).toContain('frozen');
    expect(states).toContain('thrown');
  });

  it('permite Astro contra Astro sem compartilhar identidade ou estado', () => {
    const world = new CombatWorld(astroRiso, astroRiso, 'versus');
    enterFight(world);
    const [one, two] = world.snapshot().fighters;
    expect(one.id).toBe('astro-riso');
    expect(two.id).toBe('astro-riso');
    expect(world.fighters[0]).not.toBe(world.fighters[1]);
    world.step(input(['light'], ['light']), input(['block']));
    expect(world.snapshot().fighters).toHaveLength(2);
  });
});
