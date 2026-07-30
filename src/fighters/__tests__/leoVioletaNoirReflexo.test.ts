import { describe, expect, it } from 'vitest';
import { CombatWorld } from '../../combat/CombatWorld';
import { FighterRuntime } from '../../combat/FighterRuntime';
import { deterministicHash } from '../../online/stateHash';
import type { HitboxDefinition, InputAction, InputFrame } from '../../types/combat';
import { AVAILABLE_FIGHTERS } from '../index';
import { gutoBarba } from '../gutoBarba';
import { leoVioleta } from '../leoVioleta';
import { noirReflexo } from '../noirReflexo';
import { rafaMare } from '../rafaMare';
import {
  FIGHTER_SPRITE_ASSETS,
  leoVioletaSpriteAsset,
  noirReflexoSpriteAsset,
} from '../visual';

const input = (
  held: readonly InputAction[] = [],
  pressed: readonly InputAction[] = [],
): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});

const empty = input();

function enterFight(world: CombatWorld): void {
  for (let frame = 0; frame < 105; frame += 1) world.step(empty, empty);
  world.drainEvents();
}

function qcfSpecial(world: CombatWorld, side: 'p1' | 'p2' = 'p1'): void {
  const sequence = [
    input(['down']),
    input(['down', 'right']),
    input(['right', 'special'], ['special']),
  ];
  for (const frame of sequence) {
    world.step(side === 'p1' ? frame : empty, side === 'p2' ? frame : empty);
  }
}

const testHitbox = (
  kind: HitboxDefinition['kind'],
  level: HitboxDefinition['level'],
  damage = 100,
): HitboxDefinition => ({
  id: `test-${kind}-${level}`,
  kind,
  level,
  x: 0,
  y: -50,
  width: 40,
  height: 40,
  damage,
  chipDamage: 5,
  hitStun: 12,
  blockStun: 8,
  hitStop: 0,
  priority: 1,
  knockbackX: 0,
  knockbackY: 0,
});

describe('Léo Violeta e Noir Reflexo', () => {
  it('libera os dois no roster de seis com os stats oficiais', () => {
    expect(AVAILABLE_FIGHTERS).toHaveLength(6);
    expect(AVAILABLE_FIGHTERS).toEqual(expect.arrayContaining([leoVioleta, noirReflexo]));
    expect(leoVioleta.stats).toEqual({
      maxHealth: 1050,
      walkSpeed: 2.9,
      backwardSpeed: 2.3,
      jumpSpeed: 14.4,
      jumpForwardSpeed: 2.95,
      jumpBackwardSpeed: 2.55,
      gravity: 0.94,
      weight: 1.05,
      pushbox: { x: -15, y: -56, width: 30, height: 56 },
    });
    expect(noirReflexo.stats).toEqual({
      maxHealth: 980,
      walkSpeed: 2.65,
      backwardSpeed: 2.55,
      jumpSpeed: 14.4,
      jumpForwardSpeed: 2.85,
      jumpBackwardSpeed: 2.7,
      gravity: 0.92,
      weight: 0.98,
      pushbox: { x: -14, y: -54, width: 28, height: 54 },
    });
  });

  it('mantém 12 normais e configura o trio de golpes do Léo nos limites pedidos', () => {
    expect(Object.values(leoVioleta.moves)).toHaveLength(15);

    const olhar = leoVioleta.moves.olharFrio!;
    expect(olhar.command.directions).toEqual(['down', 'downForward', 'forward']);
    expect(olhar.hitboxes).toEqual([]);
    expect(olhar.events).toEqual([{
      frame: 9,
      type: 'spawnProjectile',
      projectileId: 'olharFrio',
    }]);
    const olharProjectile = leoVioleta.projectiles?.olharFrio;
    expect(olharProjectile).toMatchObject({
      offsetX: 48,
      offsetY: -78,
      velocityX: 5.2,
      lifeFrames: 42,
      maxActivePerOwner: 1,
      hitbox: {
        kind: 'projectile',
        level: 'mid',
        damage: 40,
        chipDamage: 4,
        hitStun: 23,
        blockStun: 18,
      },
    });
    expect(olharProjectile?.hitbox.freezeFrames).toBeUndefined();
    expect(olharProjectile?.hitbox.knockdown).toBeUndefined();

    const impacto = leoVioleta.moves.impactoSombrio!;
    expect(impacto.command.directions).toEqual(['forward', 'down', 'downForward']);
    expect(impacto.hitboxes[0]?.boxes[0]).toMatchObject({
      kind: 'strike',
      damage: 116,
      knockdown: true,
    });
    expect(impacto.totalFrames - impacto.hitboxes[0]!.range.to).toBeGreaterThanOrEqual(20);

    const pressao = leoVioleta.moves.pressaoVioleta!;
    const pressaoHits = pressao.hitboxes.flatMap(({ boxes }) => boxes);
    expect(pressao).toMatchObject({ meterCost: 100, isSuper: true });
    expect(pressao.command.directions).toEqual(['down', 'downBack', 'back']);
    expect(pressaoHits).toHaveLength(5);
    expect(pressaoHits.reduce((sum, hitbox) => sum + hitbox.damage, 0)).toBe(230);
    expect(pressaoHits.at(-1)).toMatchObject({ damage: 62, knockdown: true });
  });

  it.each([leoVioleta, noirReflexo])(
    'mantém normais terrestres úteis, lows com contato/KD e seis ataques aéreos em %s',
    (fighter) => {
      const normalIds = [
        'lightPunch',
        'heavyPunch',
        'lowKick',
        'forwardLight',
        'sweep',
        'forwardHeavy',
        'jumpLightNeutral',
        'jumpHeavyNeutral',
        'jumpLightForward',
        'jumpHeavyForward',
        'jumpLightBackward',
        'jumpHeavyBackward',
      ] as const;
      for (const moveId of normalIds) {
        const move = fighter.moves[moveId];
        expect(move, `${fighter.id}.${moveId}`).toBeDefined();
        expect(move?.hitboxes.length, `${fighter.id}.${moveId}`).toBeGreaterThan(0);
        expect(move?.hitboxes[0]?.boxes[0]?.width, `${fighter.id}.${moveId}`).toBeGreaterThan(0);
      }
      expect(fighter.moves.lowKick?.hitboxes[0]?.boxes[0]).toMatchObject({
        level: 'low',
      });
      expect(fighter.moves.sweep?.hitboxes[0]?.boxes[0]).toMatchObject({
        level: 'low',
        knockdown: true,
      });
      expect(normalIds.filter((moveId) => fighter.moves[moveId]?.air)).toHaveLength(6);
    },
  );

  it('configura parry, Quebra-Luz e Impacto Solar nos limites pedidos', () => {
    expect(Object.values(noirReflexo.moves)).toHaveLength(15);
    expect(noirReflexo.moves.reflexoNegro?.events).toEqual([{
      frame: 5,
      type: 'grantParry',
      durationFrames: 6,
      riposteDamage: 100,
    }]);

    const quebra = noirReflexo.projectiles?.quebraLuz;
    expect(quebra).toMatchObject({
      maxActivePerOwner: 1,
      hitbox: {
        kind: 'projectile',
        damage: 62,
        offensiveDebuffFrames: 105,
        offensiveDebuffMultiplier: 0.88,
      },
    });

    const solar = noirReflexo.projectiles?.impactoSolar;
    expect(noirReflexo.moves.impactoSolar).toMatchObject({
      meterCost: 100,
      isSuper: true,
    });
    expect(solar).toMatchObject({
      maxActivePerOwner: 1,
      hitbox: {
        kind: 'projectile',
        level: 'mid',
        damage: 232,
        knockdown: true,
      },
    });
  });

  it('executa a riposta determinística contra strike e consome o parry', () => {
    const world = new CombatWorld(rafaMare, noirReflexo, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 335;
    world.step(input(['light'], ['light']), empty);
    for (let frame = 0; frame < 3; frame += 1) world.step(empty, empty);

    const noir = world.fighters[1];
    noir.parryFrames = 2;
    noir.parryRiposteDamage = 100;
    const attackerHealth = world.fighters[0].health;
    world.step(empty, empty);

    expect(world.fighters[0].health).toBe(attackerHealth - 100);
    expect(noir.parryFrames).toBe(0);
    expect(noir.parryRiposteDamage).toBe(0);
    expect(world.drainEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'parry',
        attacker: 'noir-reflexo',
        defender: 'rafa-mare',
        value: 100,
      }),
    ]));
  });

  it('aceita high, mid, overhead e projétil comum no parry, mas não low ou throw', () => {
    const noir = new FighterRuntime(noirReflexo, 300, 1);
    noir.parryFrames = 6;
    noir.parryRiposteDamage = 100;

    expect(noir.canParry(testHitbox('strike', 'high'))).toBe(true);
    expect(noir.canParry(testHitbox('strike', 'mid'))).toBe(true);
    expect(noir.canParry(testHitbox('strike', 'overhead'))).toBe(true);
    expect(noir.canParry(testHitbox('projectile', 'mid'))).toBe(true);
    expect(noir.canParry(testHitbox('strike', 'low'))).toBe(false);
    expect(noir.canParry(testHitbox('throw', 'mid'))).toBe(false);
  });

  it('aplica Quebra-Luz apenas no hit e renova sem acumular', () => {
    const hitWorld = new CombatWorld(noirReflexo, rafaMare, 'versus');
    enterFight(hitWorld);
    hitWorld.fighters[0].x = 300;
    hitWorld.fighters[1].x = 370;
    qcfSpecial(hitWorld);
    for (let frame = 0; frame < 80 && hitWorld.fighters[1].offensiveDebuffFrames === 0; frame += 1) {
      hitWorld.step(empty, empty);
    }
    expect(hitWorld.fighters[1].offensiveDebuffFrames).toBeGreaterThan(0);
    expect(hitWorld.fighters[1].offensiveDebuffMultiplier).toBe(0.88);
    expect(hitWorld.drainEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'debuff', moveId: 'quebraLuz' }),
    ]));

    const blockedWorld = new CombatWorld(noirReflexo, rafaMare, 'versus');
    enterFight(blockedWorld);
    blockedWorld.fighters[0].x = 300;
    blockedWorld.fighters[1].x = 370;
    qcfSpecial(blockedWorld);
    for (let frame = 0; frame < 80; frame += 1) {
      blockedWorld.step(empty, input(['block']));
    }
    expect(blockedWorld.fighters[1].offensiveDebuffFrames).toBe(0);

    const target = new FighterRuntime(rafaMare, 400, -1);
    target.applyOffensiveDebuff(90, 0.9);
    target.applyOffensiveDebuff(105, 0.88);
    expect(target.offensiveDebuffFrames).toBe(105);
    expect(target.offensiveDebuffMultiplier).toBe(0.88);
  });

  it('reduz dano causado em 12%, expira e participa de snapshot/reset/hash', () => {
    const attacker = new FighterRuntime(rafaMare, 300, 1);
    const target = new FighterRuntime(noirReflexo, 340, -1);
    attacker.applyOffensiveDebuff(2, 0.88);
    const result = target.applyHit(
      testHitbox('strike', 'mid'),
      1,
      false,
      1,
      false,
      attacker.outgoingDamageMultiplier,
    );
    expect(result.damage).toBe(88);
    expect(attacker.snapshot()).toMatchObject({
      offensiveDebuffFrames: 2,
      offensiveDebuffMultiplier: 0.88,
    });

    const withDebuffHash = deterministicHash(attacker.exportDeterministicState());
    attacker.beginFrame(empty, 1, 400);
    attacker.finishFrame();
    expect(attacker.offensiveDebuffFrames).toBe(1);
    expect(deterministicHash(attacker.exportDeterministicState())).not.toBe(withDebuffHash);
    attacker.beginFrame(empty, 2, 400);
    attacker.finishFrame();
    expect(attacker.outgoingDamageMultiplier).toBe(1);

    attacker.parryFrames = 4;
    attacker.parryRiposteDamage = 100;
    attacker.applyOffensiveDebuff(90, 0.88);
    attacker.resetRound(188, 1, false);
    expect(attacker.snapshot()).toMatchObject({
      parryFrames: 0,
      offensiveDebuffFrames: 0,
      offensiveDebuffMultiplier: 1,
    });
  });

  it('faz Olhar Frio viajar e acertar fora do alcance corporal uma única vez', () => {
    const world = new CombatWorld(leoVioleta, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 280;
    world.fighters[1].x = 445;
    const health = world.fighters[1].health;
    qcfSpecial(world);

    let sawProjectile = false;
    for (let frame = 0; frame < 70 && world.fighters[1].health === health; frame += 1) {
      world.step(empty, empty);
      sawProjectile ||= world.snapshot().projectiles.some(
        (projectile) => projectile.projectileId === 'olharFrio',
      );
    }

    expect(sawProjectile).toBe(true);
    expect(world.fighters[1].health).toBe(health - 40);
    expect(world.snapshot().projectiles).toHaveLength(0);
    expect(world.drainEvents().filter(
      (event) => event.type === 'hit' && event.moveId === 'olharFrio',
    )).toHaveLength(1);
  });

  it('permite bloquear e saltar o Olhar Frio, expira e limpa no reset de treino', () => {
    const blocked = new CombatWorld(leoVioleta, rafaMare, 'versus');
    enterFight(blocked);
    blocked.fighters[0].x = 280;
    blocked.fighters[1].x = 430;
    const blockedHealth = blocked.fighters[1].health;
    qcfSpecial(blocked);
    for (let frame = 0; frame < 70; frame += 1) {
      blocked.step(empty, input(['block']));
    }
    expect(blocked.fighters[1].health).toBe(blockedHealth - 4);
    expect(blocked.drainEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'blocked', moveId: 'olharFrio' }),
    ]));

    const jumped = new CombatWorld(leoVioleta, rafaMare, 'versus');
    enterFight(jumped);
    jumped.fighters[0].x = 280;
    jumped.fighters[1].x = 430;
    const jumpedHealth = jumped.fighters[1].health;
    qcfSpecial(jumped);
    for (let frame = 0; frame < 7; frame += 1) jumped.step(empty, empty);
    jumped.step(empty, input(['up'], ['up']));
    for (let frame = 0; frame < 70; frame += 1) jumped.step(empty, empty);
    expect(jumped.fighters[1].health).toBe(jumpedHealth);

    const expired = new CombatWorld(leoVioleta, rafaMare, 'training');
    enterFight(expired);
    expired.fighters[0].x = 90;
    expired.fighters[1].x = 600;
    qcfSpecial(expired);
    for (let frame = 0; frame < 12; frame += 1) expired.step(empty, empty);
    expect(expired.snapshot().projectiles).toHaveLength(1);
    expired.resetTrainingPositions();
    expect(expired.snapshot().projectiles).toHaveLength(0);

    qcfSpecial(expired);
    for (let frame = 0; frame < 60; frame += 1) expired.step(empty, empty);
    expect(expired.snapshot().projectiles).toHaveLength(0);
  });

  it('limita Olhar Frio por dono, mantém espelhos independentes e hash determinístico', () => {
    const doubleSpawnLeo = {
      ...leoVioleta,
      moves: {
        ...leoVioleta.moves,
        olharFrio: {
          ...leoVioleta.moves.olharFrio!,
          events: [
            { frame: 9, type: 'spawnProjectile' as const, projectileId: 'olharFrio' },
            { frame: 10, type: 'spawnProjectile' as const, projectileId: 'olharFrio' },
          ],
        },
      },
    };
    const limited = new CombatWorld(doubleSpawnLeo, rafaMare, 'versus');
    enterFight(limited);
    limited.fighters[0].x = 100;
    limited.fighters[1].x = 600;
    qcfSpecial(limited);
    for (let frame = 0; frame < 12; frame += 1) limited.step(empty, empty);
    expect(limited.snapshot().projectiles.filter(
      (projectile) => projectile.projectileId === 'olharFrio',
    )).toHaveLength(1);

    const mirror = new CombatWorld(leoVioleta, leoVioleta, 'versus');
    enterFight(mirror);
    mirror.fighters[0].x = 180;
    mirror.fighters[1].x = 460;
    const mirroredInputs: readonly [InputFrame, InputFrame][] = [
      [input(['down']), input(['down'])],
      [input(['down', 'right']), input(['down', 'left'])],
      [input(['right', 'special'], ['special']), input(['left', 'special'], ['special'])],
    ];
    for (const [one, two] of mirroredInputs) mirror.step(one, two);
    for (let frame = 0; frame < 12; frame += 1) mirror.step(empty, empty);
    const mirrorProjectiles = mirror.snapshot().projectiles;
    expect(mirrorProjectiles).toHaveLength(2);
    expect(mirrorProjectiles.map(({ facing }) => facing).sort()).toEqual([-1, 1]);

    const left = new CombatWorld(leoVioleta, noirReflexo, 'versus');
    const right = new CombatWorld(leoVioleta, noirReflexo, 'versus');
    enterFight(left);
    enterFight(right);
    left.fighters[0].x = right.fighters[0].x = 120;
    left.fighters[1].x = right.fighters[1].x = 560;
    for (const world of [left, right]) qcfSpecial(world);
    for (let frame = 0; frame < 18; frame += 1) {
      left.step(empty, empty);
      right.step(empty, empty);
    }
    expect(left.exportDeterministicState()).toEqual(right.exportDeterministicState());
    expect(deterministicHash(left.exportDeterministicState()))
      .toBe(deterministicHash(right.exportDeterministicState()));
  });

  it('registra 35 animações, efeitos dedicados e oito poses de vítima', () => {
    expect(FIGHTER_SPRITE_ASSETS).toEqual(expect.arrayContaining([
      leoVioletaSpriteAsset,
      noirReflexoSpriteAsset,
    ]));
    for (const asset of [leoVioletaSpriteAsset, noirReflexoSpriteAsset]) {
      expect(Object.values(asset.animations)).toHaveLength(35);
      expect(asset.animations.grabbedFront.frames).toBe(8);
      expect(asset.animations.grabbedLifted.frames).toBe(8);
      expect(asset).toMatchObject({
        frameWidth: 256,
        frameHeight: 256,
        origin: { x: 0.5, y: 1 },
        scale: 1,
        visualOffset: { x: 0, y: 6 },
      });
    }
    expect(leoVioletaSpriteAsset.effects).toHaveLength(3);
    expect(leoVioletaSpriteAsset.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moveId: 'olharFrio',
        usage: 'projectile',
      }),
    ]));
    expect(leoVioletaSpriteAsset.effects.filter(
      (effect) => effect.moveId === 'olharFrio' && effect.usage === 'attached',
    )).toHaveLength(0);
    expect(noirReflexoSpriteAsset.effects).toHaveLength(4);
    expect(noirReflexoSpriteAsset.effects.at(-1)).toMatchObject({
      usage: 'status',
      statusField: 'offensiveDebuffFrames',
    });
  });

  it('declara offsets explícitos e neutros para os dois agarrões do Guto', () => {
    for (const moveId of ['ganchoUrso', 'abracoGlacial'] as const) {
      const offsets = gutoBarba.moves[moveId]?.grab?.victimOffsets;
      expect(offsets?.['leo-violeta']).toEqual({
        anchorOffsetX: 0,
        anchorOffsetY: 0,
        rotationOffset: 0,
      });
      expect(offsets?.['noir-reflexo']).toEqual({
        anchorOffsetX: 0,
        anchorOffsetY: 0,
        rotationOffset: 0,
      });
    }
  });
});
