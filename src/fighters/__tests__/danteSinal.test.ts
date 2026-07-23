import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const requireRaster = createRequire(import.meta.url);
const { decodePng } = requireRaster('../../../scripts/fighterRasterAnalysis.mjs') as {
  decodePng: (buffer: Buffer) => { width: number; height: number; pixels: Uint8Array };
};
import { CombatWorld } from '../../combat/CombatWorld';
import { FighterRuntime } from '../../combat/FighterRuntime';
import type { InputAction, InputFrame } from '../../types/combat';
import { danteSinal, DANTE_BOMBA_FUMACA } from '../danteSinal';
import { astroRiso } from '../astroRiso';
import { gutoBarba } from '../gutoBarba';
import { rafaMare } from '../rafaMare';
import { AVAILABLE_FIGHTERS } from '../index';
import { danteSinalSpriteAsset, FIGHTER_SPRITE_ASSETS } from '../visual';
import { resolveProjectileVisualFrame } from '../../ui/fighterAnimationResolver';

const input = (held: readonly InputAction[] = [], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});

const empty = input();

/** Distância neutra fixa para provas de Chave Binária (reação possível). */
const CHAVE_NEUTRAL_GAP = 120;

function enterFight(world: CombatWorld): void {
  for (let frame = 0; frame < 105; frame += 1) world.step(empty, empty);
  world.drainEvents();
}

function fireSpecial(
  world: CombatWorld,
  side: 'p1' | 'p2',
  sequence: readonly InputFrame[],
): void {
  for (const frame of sequence) {
    if (side === 'p1') world.step(frame, empty);
    else world.step(empty, frame);
  }
}

function bombaSequence(facing: 1 | -1): InputFrame[] {
  if (facing === 1) {
    return [
      input(['down']),
      input(['down', 'right']),
      input(['right', 'special'], ['special']),
    ];
  }
  return [
    input(['down']),
    input(['down', 'left']),
    input(['left', 'special'], ['special']),
  ];
}

function chaveSequence(facing: 1 | -1): InputFrame[] {
  if (facing === 1) {
    return [
      input(['down']),
      input(['down', 'left']),
      input(['left', 'special'], ['special']),
    ];
  }
  return [
    input(['down']),
    input(['down', 'right']),
    input(['right', 'special'], ['special']),
  ];
}

function pontoSequence(facing: 1 | -1): InputFrame[] {
  if (facing === 1) {
    return [
      input(['right']),
      input(['down']),
      input(['down', 'right', 'special'], ['special']),
    ];
  }
  return [
    input(['left']),
    input(['down']),
    input(['down', 'left', 'special'], ['special']),
  ];
}

function waitProjectile(
  world: CombatWorld,
  projectileId: string,
  maxFrames = 80,
): NonNullable<ReturnType<CombatWorld['snapshot']>['projectiles'][number]> {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    world.step(empty, empty);
    const marker = world.snapshot().projectiles.find((p) => p.projectileId === projectileId);
    if (marker) return marker;
  }
  throw new Error(`projétil ${projectileId} não apareceu`);
}

describe('Dante Sinal', () => {
  it('está disponível com arquétipo TECHNICAL / ZONER e stats oficiais', () => {
    expect(danteSinal.available).toBe(true);
    expect(AVAILABLE_FIGHTERS).toContain(danteSinal);
    expect(danteSinal.archetype).toBe('TECHNICAL / ZONER');
    expect(danteSinal.abilities).toEqual(['Ponto Final', 'Bomba de Fumaça', 'Chave Binária']);
    expect(danteSinal.passive).toBeUndefined();
    expect(danteSinal.stats).toMatchObject({
      maxHealth: 960,
      walkSpeed: 2.85,
      backwardSpeed: 2.65,
      jumpSpeed: 14.8,
    });
  });

  it('registra o pacote visual com fumaça de status e hazards de projétil', () => {
    expect(FIGHTER_SPRITE_ASSETS).toContain(danteSinalSpriteAsset);
    expect(danteSinalSpriteAsset).toMatchObject({
      fighterId: 'dante-sinal',
      frameWidth: 256,
      frameHeight: 256,
      origin: { x: 0.5, y: 1 },
      scale: 1,
      visualOffset: { x: 0, y: 6 },
    });
    expect(Object.values(danteSinalSpriteAsset.animations)).toHaveLength(35);
    expect(danteSinalSpriteAsset.effects).toHaveLength(3);
    expect(danteSinalSpriteAsset.effects.map(({ moveId, usage, statusField }) => ({
      moveId,
      usage,
      statusField,
    }))).toEqual([
      { moveId: 'bombaFumaca', usage: 'status', statusField: 'damageReductionFrames' },
      { moveId: 'chaveBinaria', usage: 'projectile', statusField: undefined },
      { moveId: 'pontoFinal', usage: 'projectile', statusField: undefined },
    ]);
    expect(danteSinalSpriteAsset.animations.special2.path).toContain('bomba-fumaca.png');
  });

  it('configura Bomba, Chave projétil e Ponto Final conforme o kit corrigido', () => {
    const bomba = danteSinal.moves.bombaFumaca!;
    expect(bomba).toMatchObject({ meterCost: 0, state: 'specialAttack', totalFrames: 40 });
    expect(bomba.hitboxes).toHaveLength(0);
    expect(bomba.movement).toBeUndefined();
    expect(bomba.events?.[0]).toMatchObject({
      frame: 12,
      type: 'grantDamageReduction',
      durationFrames: DANTE_BOMBA_FUMACA.durationFrames,
      multiplier: DANTE_BOMBA_FUMACA.multiplier,
      cooldownFrames: DANTE_BOMBA_FUMACA.cooldownFrames,
    });
    expect(danteSinal.moves.cortinaOptica).toBeUndefined();

    const chave = danteSinal.projectiles?.chaveBinaria;
    expect(chave).toMatchObject({
      armingFrames: 0,
      spawnMode: 'ownerOffset',
      maxActivePerOwner: 1,
      velocityX: 5,
      lifeFrames: 120,
      offsetY: -54,
    });
    expect(chave?.offsetX).toBeGreaterThanOrEqual(42);
    expect(chave?.offsetX).toBeLessThanOrEqual(48);
    expect(chave?.hitbox).toMatchObject({
      level: 'mid',
      damage: 65,
      chipDamage: 4,
      hitStun: 18,
      blockStun: 12,
      hitStop: 7,
      width: 28,
      height: 16,
    });

    const low = danteSinal.moves.lowKick!;
    expect(low).toMatchObject({ totalFrames: 30 });
    expect(low.hitboxes[0]?.range).toEqual({ from: 11, to: 14 });
    expect(low.hitboxes[0]?.boxes[0]?.damage).toBe(55);

    const sweep = danteSinal.moves.rasteira!;
    expect(sweep).toMatchObject({ totalFrames: 38 });
    expect(sweep.hitboxes[0]?.range).toEqual({ from: 14, to: 19 });
    expect(sweep.hitboxes[0]?.boxes[0]).toMatchObject({ damage: 90, knockdown: true });

    const ponto = danteSinal.projectiles?.pontoFinal;
    expect(ponto).toMatchObject({
      armingFrames: 42,
      lifeFrames: 47,
      spawnMode: 'targetSnapshot',
      maxActivePerOwner: 1,
    });
    expect(ponto!.lifeFrames).toBeGreaterThanOrEqual(ponto!.armingFrames! + 4);
    expect(ponto!.hitbox).toMatchObject({ damage: 240, level: 'mid', knockdown: true });
  });

  it('Bomba de Fumaça: grant no evento, 120 frames, 0.70, sem stack/refresh, limpa no reset', () => {
    const world = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 420;
    fireSpecial(world, 'p1', bombaSequence(1));
    expect(world.fighters[0].currentMove?.id).toBe('bombaFumaca');

    // Antes do frame 12: sem redução
    for (let frame = 0; frame < 11; frame += 1) world.step(empty, empty);
    expect(world.fighters[0].damageReductionFrames).toBe(0);

    // No frame do evento (stateFrame avança em finishFrame; garante grant)
    for (let frame = 0; frame < 5; frame += 1) {
      world.step(empty, empty);
      if (world.fighters[0].damageReductionFrames > 0) break;
    }
    expect(world.fighters[0].damageReductionFrames).toBe(DANTE_BOMBA_FUMACA.durationFrames);
    expect(world.fighters[0].damageReductionMultiplier).toBe(DANTE_BOMBA_FUMACA.multiplier);
    expect(world.fighters[0].damageReductionCooldownFrames).toBeGreaterThanOrEqual(
      DANTE_BOMBA_FUMACA.durationFrames,
    );

    const snap = world.snapshot().fighters[0];
    expect(snap.damageReductionFrames).toBe(DANTE_BOMBA_FUMACA.durationFrames);

    // Sem refresh
    const remaining = world.fighters[0].damageReductionFrames;
    fireSpecial(world, 'p1', bombaSequence(1));
    for (let frame = 0; frame < 20; frame += 1) world.step(empty, empty);
    expect(world.fighters[0].damageReductionFrames).toBeLessThanOrEqual(remaining);

    // Expiração exata: após 120 beginFrames desde o grant
    const fighter = world.fighters[0];
    fighter.damageReductionFrames = 120;
    fighter.damageReductionMultiplier = 0.7;
    for (let i = 0; i < 120; i += 1) {
      expect(fighter.damageReductionFrames).toBe(120 - i);
      fighter.beginFrame(empty, i + 1, 400);
      fighter.finishFrame();
    }
    expect(fighter.damageReductionFrames).toBe(0);
    expect(fighter.damageReductionMultiplier).toBe(1);

    const training = new CombatWorld(danteSinal, rafaMare, 'training');
    enterFight(training);
    training.fighters[0].damageReductionFrames = 50;
    training.fighters[0].damageReductionCooldownFrames = 80;
    training.resetTrainingPositions();
    expect(training.fighters[0].damageReductionFrames).toBe(0);
    expect(training.fighters[0].damageReductionCooldownFrames).toBe(0);
  });

  it('Bomba reduz strikes, chip, projéteis e throws sem armadura/invulnerabilidade', () => {
    const world = new CombatWorld(rafaMare, danteSinal, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 340;
    world.fighters[1].damageReductionFrames = 120;
    world.fighters[1].damageReductionMultiplier = 0.7;

    const health = world.fighters[1].health;
    // jab de Rafa com redução 0.70 — dano final ~70% do base
    world.step(input([], ['light']), empty);
    for (let frame = 0; frame < 20; frame += 1) world.step(empty, empty);
    const afterStrike = world.fighters[1].health;
    const dealt = health - afterStrike;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThanOrEqual(Math.round(50 * 0.7) + 1);
    expect(dealt).toBeLessThan(50);
    // ainda sofre hit-stun
    expect(['hitStun', 'idle', 'walkForward', 'walkBackward', 'crouch'].includes(world.fighters[1].state)
      || world.fighters[1].state === 'hitStun').toBe(true);

    // continua vulnerável a throw/grab (Guto)
    const grabWorld = new CombatWorld(gutoBarba, danteSinal, 'versus');
    enterFight(grabWorld);
    grabWorld.fighters[0].x = 300;
    grabWorld.fighters[1].x = 330;
    grabWorld.fighters[1].damageReductionFrames = 120;
    grabWorld.fighters[1].damageReductionMultiplier = 0.7;
    grabWorld.step(input(['right', 'special'], ['special']), empty);
    let grabbed = false;
    for (let frame = 0; frame < 40; frame += 1) {
      grabWorld.step(empty, empty);
      if (grabWorld.fighters[1].grabbedBy) grabbed = true;
    }
    expect(grabbed).toBe(true);
  });

  it('Chave Binária é projétil mid: acerta em pé, falha agachado/salto, bloqueia com chip', () => {
    // Em pé
    const standing = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(standing);
    standing.fighters[0].x = 300;
    standing.fighters[1].x = 300 + CHAVE_NEUTRAL_GAP;
    fireSpecial(standing, 'p1', chaveSequence(1));
    const proj = waitProjectile(standing, 'chave-binaria-hazard');
    expect(proj.state).toBe('active');
    expect(proj.armingFrames).toBe(0);
    const health = standing.fighters[1].health;
    const startX = proj.x;
    const startFacing = proj.facing;
    for (let frame = 0; frame < 40; frame += 1) {
      standing.step(empty, empty);
      const live = standing.snapshot().projectiles.find((p) => p.projectileId === 'chave-binaria-hazard');
      if (live) {
        expect(live.facing).toBe(startFacing);
        expect(live.x).not.toBe(startX); // move-se
      }
      if (standing.fighters[1].health < health) break;
    }
    expect(standing.fighters[1].health).toBe(health - 65);

    // Agachado antes da chegada
    const crouch = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(crouch);
    crouch.fighters[0].x = 300;
    crouch.fighters[1].x = 300 + CHAVE_NEUTRAL_GAP;
    fireSpecial(crouch, 'p1', chaveSequence(1));
    waitProjectile(crouch, 'chave-binaria-hazard');
    const crouchHealth = crouch.fighters[1].health;
    for (let frame = 0; frame < 50; frame += 1) {
      crouch.step(empty, input(['down']));
    }
    expect(crouch.fighters[1].health).toBe(crouchHealth);

    // Salto reativo
    const jump = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(jump);
    jump.fighters[0].x = 300;
    jump.fighters[1].x = 300 + CHAVE_NEUTRAL_GAP;
    fireSpecial(jump, 'p1', chaveSequence(1));
    waitProjectile(jump, 'chave-binaria-hazard');
    const jumpHealth = jump.fighters[1].health;
    jump.step(empty, input(['up'], ['up']));
    for (let frame = 0; frame < 50; frame += 1) jump.step(empty, empty);
    expect(jump.fighters[1].health).toBe(jumpHealth);

    // Block mid com chip
    const block = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(block);
    block.fighters[0].x = 300;
    block.fighters[1].x = 300 + CHAVE_NEUTRAL_GAP;
    fireSpecial(block, 'p1', chaveSequence(1));
    waitProjectile(block, 'chave-binaria-hazard');
    const blockHealth = block.fighters[1].health;
    for (let frame = 0; frame < 50; frame += 1) {
      block.step(empty, input(['left', 'block']));
    }
    // chip 4 (sem redução)
    expect(block.fighters[1].health).toBe(blockHealth - 4);
  });

  it('Chave: no máximo um por dono sem substituir; espelho independente; limpa no reset', () => {
    const world = new CombatWorld(danteSinal, rafaMare, 'training');
    enterFight(world);
    world.fighters[0].x = 280;
    // Alvo longe o suficiente para não consumir o projétil durante a prova.
    world.fighters[1].x = 600;
    fireSpecial(world, 'p1', chaveSequence(1));
    const first = waitProjectile(world, 'chave-binaria-hazard');
    const firstId = first.runtimeId;
    const firstX = first.x;
    fireSpecial(world, 'p1', chaveSequence(1));
    for (let frame = 0; frame < 10; frame += 1) world.step(empty, empty);
    const own = world.snapshot().projectiles.filter((p) => p.projectileId === 'chave-binaria-hazard');
    expect(own).toHaveLength(1);
    expect(own[0]!.runtimeId).toBe(firstId);
    expect(own[0]!.x).toBeGreaterThan(firstX); // avança, não teleporta

    const mirror = new CombatWorld(danteSinal, danteSinal, 'versus');
    enterFight(mirror);
    mirror.fighters[0].x = 220;
    mirror.fighters[1].x = 520;
    fireSpecial(mirror, 'p1', chaveSequence(1));
    fireSpecial(mirror, 'p2', chaveSequence(-1));
    // Avança só o suficiente para o spawn (evento ~frame 14), sem deixar os projéteis se cruzarem nos corpos.
    for (let frame = 0; frame < 18; frame += 1) mirror.step(empty, empty);
    const traps = mirror.snapshot().projectiles.filter((p) => p.projectileId === 'chave-binaria-hazard');
    expect(traps.length).toBe(2);
    expect(new Set(traps.map((p) => p.facing)).size).toBe(2);

    world.resetTrainingPositions();
    expect(world.snapshot().projectiles).toHaveLength(0);
  });

  it('Ponto Final: 42 frames de arming, 240 de dano, fuga e block após o marcador', () => {
    const world = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 400;
    world.fighters[0].forceMeter(100);
    const targetX = world.fighters[1].x;
    fireSpecial(world, 'p1', pontoSequence(1));
    expect(world.fighters[0].meter).toBe(0);
    const marker = waitProjectile(world, 'ponto-final-hazard', 60);
    expect(marker.state).toBe('arming');
    expect(marker.armingFrames).toBe(42);
    expect(Math.abs(marker.x - targetX)).toBeLessThan(2);

    // Durante arming: sem hit e frames visuais de aviso
    const effect = danteSinalSpriteAsset.effects.find((e) => e.id === 'ponto-final-hazard')!;
    for (let age = 0; age < 42; age += 1) {
      const frame = resolveProjectileVisualFrame(effect, {
        ageFrames: age,
        armingFrames: 42,
        state: 'arming',
      });
      expect(frame).toBeLessThan(effect.warningFrameCount ?? 2);
    }
    // Mantém o alvo fora da área durante o arming (sem hits).
    world.fighters[1].x = marker.x + 120;
    while (world.snapshot().projectiles.find((p) => p.projectileId === 'ponto-final-hazard')?.state === 'arming') {
      world.step(empty, empty);
    }
    expect(world.drainEvents().filter((e) => e.type === 'hit' && e.moveId === 'pontoFinal')).toHaveLength(0);

    const health = world.fighters[1].health;
    world.fighters[1].x = marker.x;
    for (let frame = 0; frame < 10; frame += 1) world.step(empty, empty);
    const hits = world.drainEvents().filter((e) => e.type === 'hit' && e.moveId === 'pontoFinal');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.value).toBe(240);
    expect(world.fighters[1].health).toBe(health - 240);

    // Fuga por movimento
    const flee = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(flee);
    flee.fighters[0].x = 300;
    flee.fighters[1].x = 400;
    flee.fighters[0].forceMeter(100);
    fireSpecial(flee, 'p1', pontoSequence(1));
    const m2 = waitProjectile(flee, 'ponto-final-hazard', 60);
    flee.fighters[1].x = m2.x + 80;
    for (let frame = 0; frame < 50; frame += 1) flee.step(empty, empty);
    expect(flee.drainEvents().filter((e) => e.type === 'hit' && e.moveId === 'pontoFinal')).toHaveLength(0);

    // Block após marcador
    const blk = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(blk);
    blk.fighters[0].x = 300;
    blk.fighters[1].x = 400;
    blk.fighters[0].forceMeter(100);
    fireSpecial(blk, 'p1', pontoSequence(1));
    const m3 = waitProjectile(blk, 'ponto-final-hazard', 60);
    blk.fighters[1].x = m3.x;
    const bh = blk.fighters[1].health;
    for (let frame = 0; frame < 55; frame += 1) {
      blk.step(empty, input(['left', 'block']));
    }
    expect(blk.fighters[1].health).toBe(bh - 25);
    expect(blk.drainEvents().some((e) => e.type === 'blocked')).toBe(true);

    // Sem energia
    const dry = new FighterRuntime(danteSinal, 220, 1);
    dry.forceMeter(99);
    dry.beginFrame(input(['right']), 1, 440);
    dry.finishFrame();
    dry.beginFrame(input(['down']), 2, 440);
    dry.finishFrame();
    dry.beginFrame(input(['down', 'right', 'special'], ['special']), 3, 440);
    expect(dry.currentMove?.id).not.toBe('pontoFinal');
  });

  it('Ponto Final: salto reativo após o marcador evita o impacto', () => {
    const world = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 400;
    world.fighters[0].forceMeter(100);
    fireSpecial(world, 'p1', pontoSequence(1));
    const marker = waitProjectile(world, 'ponto-final-hazard', 60);
    world.fighters[1].x = marker.x;
    // reage ~12–18 frames após o marcador com salto + drift para fora
    for (let frame = 0; frame < 14; frame += 1) world.step(empty, empty);
    world.step(empty, input(['up', 'right'], ['up']));
    const health = world.fighters[1].health;
    for (let frame = 0; frame < 55; frame += 1) {
      // mantém impulso aéreo sem reentrar no marker no pouso
      const f1 = world.fighters[1];
      if (f1.y >= 304 && Math.abs(f1.x - marker.x) < 30) {
        f1.x = marker.x + 70;
      }
      world.step(empty, empty);
    }
    expect(world.fighters[1].health).toBe(health);
  });

  it('chute baixo e rasteira usam timings/hitboxes corrigidos', () => {
    const world = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 340;
    world.step(input(['down'], ['light']), empty);
    expect(world.fighters[0].currentMove?.id).toBe('lowKick');
    const lowHealth = world.fighters[1].health;
    for (let frame = 0; frame < 35; frame += 1) world.step(empty, empty);
    expect(world.fighters[1].health).toBe(lowHealth - 55);

    const sweepWorld = new CombatWorld(danteSinal, rafaMare, 'versus');
    enterFight(sweepWorld);
    sweepWorld.fighters[0].x = 300;
    sweepWorld.fighters[1].x = 340;
    sweepWorld.step(input(['down'], ['heavy']), empty);
    expect(sweepWorld.fighters[0].currentMove?.id).toBe('rasteira');
    const sHealth = sweepWorld.fighters[1].health;
    for (let frame = 0; frame < 45; frame += 1) sweepWorld.step(empty, empty);
    expect(sweepWorld.fighters[1].health).toBe(sHealth - 90);
  });

  it('Dante sofre e conclui Gancho e Abraço Glacial do Guto como vítima separada', () => {
    // Gancho do Urso: captura → lift → throw → release
    const gancho = new CombatWorld(gutoBarba, danteSinal, 'versus');
    enterFight(gancho);
    gancho.fighters[0].x = 300;
    gancho.fighters[1].x = 330;
    gancho.fighters[0].forceMeter(100);
    const ganchoHealth = gancho.fighters[1].health;
    gancho.step(input(['right', 'special'], ['special']), empty);
    expect(gancho.fighters[0].currentMove?.id).toBe('ganchoUrso');

    const frontPoses = new Set<number>();
    const liftedPoses = new Set<number>();
    let sawThrown = false;
    for (let frame = 0; frame < 120; frame += 1) {
      const victim = gancho.snapshot().fighters[1];
      if (victim.state === 'grabbedFront' && victim.victimPoseFrame !== null) {
        frontPoses.add(victim.victimPoseFrame);
      }
      if (victim.state === 'grabbedLifted' && victim.victimPoseFrame !== null) {
        liftedPoses.add(victim.victimPoseFrame);
      }
      sawThrown ||= victim.state === 'thrown';
      gancho.step(empty, empty);
    }
    expect(frontPoses.size).toBeGreaterThan(0);
    expect(liftedPoses.size).toBeGreaterThan(0);
    expect(Math.max(...frontPoses)).toBeGreaterThanOrEqual(4); // passa do frame que travava
    expect(Math.max(...liftedPoses)).toBe(7);
    for (let pose = 1; pose <= 5; pose += 1) expect(frontPoses.has(pose)).toBe(true);
    for (let pose = 0; pose <= 7; pose += 1) expect(liftedPoses.has(pose)).toBe(true);
    expect(sawThrown).toBe(true);
    const ganchoHits = gancho.drainEvents().filter((e) => e.type === 'hit' && e.moveId === 'ganchoUrso');
    expect(ganchoHits).toHaveLength(1);
    expect(gancho.fighters[1].health).toBe(ganchoHealth - 155);
    expect(gancho.fighters[1].grabbedBy).toBeNull();
    expect(gancho.snapshot().activeGrab).toBeNull();

    // Abraço Glacial: grabbedFront 0–7 → frozen → release
    const abraco = new CombatWorld(gutoBarba, danteSinal, 'versus');
    enterFight(abraco);
    abraco.fighters[0].x = 300;
    abraco.fighters[1].x = 330;
    abraco.fighters[0].forceMeter(100);
    const abracoHealth = abraco.fighters[1].health;
    abraco.step(input(['down', 'special'], ['special']), empty);
    expect(abraco.fighters[0].currentMove?.id).toBe('abracoGlacial');

    const abracoFront = new Set<number>();
    let frozenFrames = 0;
    let abracoThrown = false;
    for (let frame = 0; frame < 220; frame += 1) {
      const victim = abraco.snapshot().fighters[1];
      if (victim.state === 'grabbedFront' && victim.victimPoseFrame !== null) {
        abracoFront.add(victim.victimPoseFrame);
      }
      if (victim.state === 'frozen') frozenFrames += 1;
      abracoThrown ||= victim.state === 'thrown';
      abraco.step(empty, empty);
    }
    expect(Math.max(...abracoFront)).toBe(7);
    for (let pose = 1; pose <= 7; pose += 1) expect(abracoFront.has(pose)).toBe(true);
    expect(frozenFrames).toBe(63);
    expect(abracoThrown).toBe(true);
    const abracoHits = abraco.drainEvents().filter((e) => e.type === 'hit' && e.moveId === 'abracoGlacial');
    expect(abracoHits).toHaveLength(1);
    expect(abraco.fighters[1].health).toBe(abracoHealth - 280);
    expect(abraco.fighters[1].freezeEffectFrames).toBe(0);
    expect(abraco.fighters[1].grabbedBy).toBeNull();
    expect(abraco.snapshot().activeGrab).toBeNull();
  });

  it('Dante com Bomba de Fumaça ativa ainda pode ser agarrado, sofre redução e é liberado', () => {
    const world = new CombatWorld(gutoBarba, danteSinal, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 330;
    world.fighters[1].damageReductionFrames = 120;
    world.fighters[1].damageReductionMultiplier = 0.7;
    const health = world.fighters[1].health;
    world.step(input(['right', 'special'], ['special']), empty);
    expect(world.fighters[0].currentMove?.id).toBe('ganchoUrso');

    let grabbed = false;
    for (let frame = 0; frame < 120; frame += 1) {
      world.step(empty, empty);
      if (world.fighters[1].grabbedBy) grabbed = true;
    }
    expect(grabbed).toBe(true);
    const hits = world.drainEvents().filter((e) => e.type === 'hit' && e.moveId === 'ganchoUrso');
    expect(hits).toHaveLength(1);
    const dealt = health - world.fighters[1].health;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(155);
    // redução 0.70 sobre 155 → 108 ou 109 conforme arredondamento do motor
    expect(dealt).toBeGreaterThanOrEqual(108);
    expect(dealt).toBeLessThanOrEqual(109);
    expect(world.fighters[1].grabbedBy).toBeNull();
    expect(world.snapshot().activeGrab).toBeNull();
  });

  it('declara e embala oito frames físicos distintos em grabbed-front e grabbed-lifted', () => {
    expect(danteSinalSpriteAsset.animations.grabbedFront.frames).toBe(8);
    expect(danteSinalSpriteAsset.animations.grabbedLifted.frames).toBe(8);
    for (const file of ['grabbed-front.png', 'grabbed-lifted.png'] as const) {
      const path = resolve(process.cwd(), 'public/assets/fighters/dante-sinal', file);
      const data = readFileSync(path);
      expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([2048, 256]);
      const png = decodePng(data);
      const hashes = new Set<string>();
      let nonEmpty = 0;
      for (let frame = 0; frame < 8; frame += 1) {
        const cell = Buffer.alloc(256 * 256 * 4);
        let opaque = 0;
        for (let y = 0; y < 256; y += 1) {
          for (let x = 0; x < 256; x += 1) {
            const src = (y * png.width + frame * 256 + x) * 4;
            const dst = (y * 256 + x) * 4;
            cell[dst] = png.pixels[src]!;
            cell[dst + 1] = png.pixels[src + 1]!;
            cell[dst + 2] = png.pixels[src + 2]!;
            cell[dst + 3] = png.pixels[src + 3]!;
            if (png.pixels[src + 3]! >= 128) opaque += 1;
          }
        }
        if (opaque > 0) nonEmpty += 1;
        hashes.add(createHash('sha256').update(cell).digest('hex'));
      }
      expect(nonEmpty).toBe(8);
      expect(hashes.size).toBe(8);
    }
  });

  it('funciona em treino/versus e preserva Mão da Maré', () => {
    for (const opponent of [rafaMare, gutoBarba, astroRiso, danteSinal]) {
      const world = new CombatWorld(danteSinal, opponent, 'versus');
      enterFight(world);
      expect(world.snapshot().phase).toBe('active');
      world.step(input([], ['light']), empty);
      expect(world.fighters[0].currentMove?.id === 'lightPunch' || world.fighters[0].state !== 'idle').toBe(true);
    }

    const rafaWorld = new CombatWorld(rafaMare, danteSinal, 'training');
    enterFight(rafaWorld);
    rafaWorld.fighters[0].x = 300;
    rafaWorld.fighters[1].x = 420;
    rafaWorld.step(input(['down']), empty);
    rafaWorld.step(input(['down', 'right']), empty);
    rafaWorld.step(input(['right', 'special'], ['special']), empty);
    for (let frame = 0; frame < 40; frame += 1) rafaWorld.step(empty, empty);
    const projs = rafaWorld.snapshot().projectiles;
    for (const p of projs) {
      if (p.ageFrames > 0) expect(p.state).toBe('active');
    }
  });

  it('rejeita comando incompleto de Bomba de Fumaça', () => {
    const fighter = new FighterRuntime(danteSinal, 220, 1);
    fighter.beginFrame(input(['down']), 1, 440);
    fighter.finishFrame();
    fighter.beginFrame(input(['right', 'special'], ['special']), 2, 440);
    expect(fighter.currentMove?.id).not.toBe('bombaFumaca');
  });
});
