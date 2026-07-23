import { describe, expect, it } from 'vitest';
import { CombatWorld } from '../../combat/CombatWorld';
import { FighterRuntime } from '../../combat/FighterRuntime';
import { astroRiso } from '../astroRiso';
import { danteSinal } from '../danteSinal';
import { gutoBarba } from '../gutoBarba';
import { rafaMare } from '../rafaMare';
import type { FighterDefinition, InputAction, InputFrame } from '../../types/combat';
import { gutoBarbaSpriteAsset } from '../visual/gutoBarbaSprite';
import { getFighterSpriteAsset } from '../visual';
import { resolveFighterAnimation } from '../../ui/fighterAnimationResolver';

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

function runFrames(
  world: CombatWorld,
  frames: number,
  playerOne: InputFrame = empty,
  playerTwo: InputFrame = empty,
): void {
  for (let frame = 0; frame < frames; frame += 1) world.step(playerOne, playerTwo);
}

function setupWorld(
  victim: FighterDefinition,
  facing: 1 | -1 = 1,
  mode: 'versus' | 'training' = 'versus',
): CombatWorld {
  const world = new CombatWorld(gutoBarba, victim, mode);
  enterFight(world);
  world.fighters[0].forceMeter(100);
  world.fighters[0].x = facing === 1 ? 300 : 340;
  world.fighters[1].x = facing === 1 ? 350 : 290;
  return world;
}

function startMove(world: CombatWorld, move: 'ganchoUrso' | 'abracoGlacial' | 'descendingBlow'): void {
  const facing = world.fighters[0].x < world.fighters[1].x ? 1 : -1;
  const direction: InputAction = facing === 1 ? 'right' : 'left';
  const button: InputAction = move === 'descendingBlow' ? 'heavy' : 'special';
  const directions: InputAction[] = move === 'abracoGlacial' ? ['down'] : [direction];
  world.step(input([...directions, button], [button]), empty);
  expect(world.fighters[0].currentMove?.id).toBe(move);
}

function snapshotAtAttackerFrame(world: CombatWorld, frame: number) {
  for (let step = 0; step < 400; step += 1) {
    const snapshot = world.snapshot();
    if (snapshot.fighters[0].stateFrame === frame) return snapshot;
    world.step(empty, empty);
  }
  throw new Error(`Guto não alcançou o frame ${frame}`);
}

describe('contratos dos três golpes de Guto', () => {
  it.each([1, -1] as const)('reconhece Frente+H e Frente+G olhando para %s', (facing) => {
    const direction: InputAction = facing === 1 ? 'right' : 'left';
    const opponentX = facing === 1 ? 400 : 0;

    const gancho = new FighterRuntime(gutoBarba, 200, facing);
    gancho.beginFrame(input([direction, 'special'], ['special']), 1, opponentX);
    expect(gancho.currentMove?.id).toBe('ganchoUrso');

    const kick = new FighterRuntime(gutoBarba, 200, facing);
    kick.beginFrame(input([direction, 'heavy'], ['heavy']), 1, opponentX);
    expect(kick.currentMove?.id).toBe('descendingBlow');
  });

  it('não executa Gancho com comando incompleto', () => {
    const fighter = new FighterRuntime(gutoBarba, 200, 1);
    fighter.beginFrame(input(['special'], ['special']), 1, 400);
    expect(fighter.currentMove?.id).toBe('muralhaNorte');
    expect(fighter.currentMove?.id).not.toBe('ganchoUrso');
  });

  it('mede a bota do Chute Pesado e preserva frame visual ativo', () => {
    const move = gutoBarba.moves.descendingBlow!;
    expect(move.hitboxes[0]).toEqual(expect.objectContaining({ range: { from: 17, to: 21 } }));
    expect(move.hitboxes[0]?.boxes[0]).toMatchObject({ x: 16, y: -169, width: 93, height: 52 });
    expect(move.usesVisualHurtboxes).toBe(true);
  });

  it.each([1, -1] as const)('Chute Pesado acerta, causa dano e hit-stop olhando para %s', (facing) => {
    const world = setupWorld(rafaMare, facing);
    world.fighters[1].x = facing === 1 ? 390 : 250;
    const health = world.fighters[1].health;
    startMove(world, 'descendingBlow');
    let sawHitStop = false;
    for (let frame = 0; frame < 70; frame += 1) {
      world.step(empty, empty);
      sawHitStop ||= world.fighters[0].isFrozen;
    }
    const hits = world.drainEvents().filter(({ type, moveId }) => type === 'hit' && moveId === 'descendingBlow');
    expect(world.fighters[1].health).toBe(health - 138);
    expect(hits).toHaveLength(1);
    expect(sawHitStop).toBe(true);
  });

  it('Chute Pesado respeita alcance, agachamento e defesa overhead', () => {
    const miss = setupWorld(rafaMare);
    miss.fighters[1].x = 440;
    startMove(miss, 'descendingBlow');
    runFrames(miss, 70);
    expect(miss.fighters[1].health).toBe(rafaMare.stats.maxHealth);

    const crouching = setupWorld(rafaMare);
    crouching.fighters[1].x = 390;
    startMove(crouching, 'descendingBlow');
    runFrames(crouching, 70, empty, input(['down']));
    expect(crouching.fighters[1].health).toBeLessThan(rafaMare.stats.maxHealth);

    const blocked = setupWorld(rafaMare);
    blocked.fighters[1].x = 390;
    const health = blocked.fighters[1].health;
    startMove(blocked, 'descendingBlow');
    runFrames(blocked, 70, empty, input(['block']));
    expect(blocked.fighters[1].health).toBe(health - 9);
    expect(blocked.drainEvents().filter(({ type }) => type === 'blocked')).toHaveLength(1);
  });

  it.each([rafaMare, astroRiso, gutoBarba, danteSinal])('Gancho separa, alinha e arremessa $name uma única vez', (victim) => {
    const world = setupWorld(victim);
    startMove(world, 'ganchoUrso');
    const front = snapshotAtAttackerFrame(world, 10);
    expect(front.fighters[1]).toMatchObject({ state: 'grabbedFront', grabbedBy: 'guto-barba' });
    expect(front.fighters[0].grabbedBy).toBeNull();

    const hold = snapshotAtAttackerFrame(world, 20);
    const offset = gutoBarba.moves.ganchoUrso!.grab!.victimOffsets?.[victim.id];
    expect(hold.fighters[1]).toMatchObject({ state: 'grabbedLifted', grabbedBy: 'guto-barba' });
    expect(hold.fighters[1].x).toBeCloseTo(
      hold.fighters[0].x + 49 + (offset?.anchorOffsetX ?? 0),
    );
    expect(hold.fighters[1].victimRotation).toBeCloseTo(offset?.rotationOffset ?? 0);
    expect(hold.fighters[1].victimPoseFrame).toBe(3);

    runFrames(world, 100);
    const hits = world.drainEvents().filter(({ type, moveId }) => type === 'hit' && moveId === 'ganchoUrso');
    expect(hits).toHaveLength(1);
    expect(world.fighters[1].health).toBe(victim.stats.maxHealth - 155);
    expect(world.snapshot().activeGrab).toBeNull();
  });

  it.each([1, -1] as const)('Gancho com Dante cobre poses 0–5/0–7, libera e aceita novo golpe (facing %s)', (facing) => {
    const grab = gutoBarba.moves.ganchoUrso!.grab!;
    const victimAsset = getFighterSpriteAsset('dante-sinal')!;
    // Timeline completa (incluindo pose 0 do contato): todos os explicitFrames cabem no sheet.
    for (const entry of grab.victimTimeline ?? []) {
      const animId = entry.state === 'grabbedFront' ? 'grabbedFront' : entry.state === 'grabbedLifted' ? 'grabbedLifted' : null;
      if (!animId) continue;
      expect(entry.poseFrame).toBeLessThan(victimAsset.animations[animId].frames);
    }

    const world = setupWorld(danteSinal, facing);
    const health = world.fighters[1].health;
    startMove(world, 'ganchoUrso');

    const frontPoses = new Set<number>();
    const liftedPoses = new Set<number>();
    let sawThrown = false;
    let sawPose4Plus = false;

    for (let step = 0; step < 200; step += 1) {
      const snap = world.snapshot();
      const victim = snap.fighters[1];
      if (victim.state === 'grabbedFront' && victim.victimPoseFrame !== null) {
        frontPoses.add(victim.victimPoseFrame);
        sawPose4Plus ||= victim.victimPoseFrame >= 4;
        const resolved = resolveFighterAnimation(victim, null, victimAsset, danteSinal);
        expect(resolved.explicitFrame).toBe(victim.victimPoseFrame);
        expect(resolved.explicitFrame!).toBeLessThan(victimAsset.animations.grabbedFront.frames);
      }
      if (victim.state === 'grabbedLifted' && victim.victimPoseFrame !== null) {
        liftedPoses.add(victim.victimPoseFrame);
        const resolved = resolveFighterAnimation(victim, null, victimAsset, danteSinal);
        expect(resolved.explicitFrame).toBe(victim.victimPoseFrame);
        expect(resolved.explicitFrame!).toBeLessThan(victimAsset.animations.grabbedLifted.frames);
      }
      sawThrown ||= victim.state === 'thrown';
      world.step(empty, empty);
      if (
        sawThrown
        && world.snapshot().activeGrab === null
        && world.fighters[1].grabbedBy === null
        && world.fighters[0].currentMove === null
      ) break;
    }

    // Hit-stop no encaixe pode pular a pose 0 (1 frame), mas 4–5 (travamento antigo) e 0–7 lifted
    // precisam existir no runtime.
    expect(sawPose4Plus).toBe(true);
    expect(Math.max(...frontPoses)).toBe(5);
    for (let pose = 1; pose <= 5; pose += 1) expect(frontPoses.has(pose)).toBe(true);
    for (let pose = 0; pose <= 7; pose += 1) expect(liftedPoses.has(pose)).toBe(true);

    const hits = world.drainEvents().filter(({ type, moveId }) => type === 'hit' && moveId === 'ganchoUrso');
    expect(hits).toHaveLength(1);
    expect(world.fighters[1].health).toBe(health - 155);
    expect(world.fighters[1].grabbedBy).toBeNull();
    expect(world.snapshot().activeGrab).toBeNull();
    expect(sawThrown).toBe(true);

    // Continua responsivo: novo golpe aceito após a soltura.
    const frameBefore = world.frame;
    world.step(input([facing === 1 ? 'right' : 'left'], ['light']), empty);
    expect(world.frame).toBe(frameBefore + 1);
    expect(world.fighters[0].currentMove?.id === 'lightPunch' || world.fighters[0].state !== 'idle').toBe(true);
  });

  it('espelha a âncora do Gancho ao trocar de lado', () => {
    const world = setupWorld(rafaMare, -1);
    startMove(world, 'ganchoUrso');
    const hold = snapshotAtAttackerFrame(world, 20);
    expect(hold.fighters[1].x).toBeCloseTo(hold.fighters[0].x - 49);
    expect(hold.fighters[1].victimRotation).toBeCloseTo(0);
  });

  it('Gancho errado não inicia hold, dano ou arremesso', () => {
    const world = setupWorld(rafaMare);
    world.fighters[1].x = 470;
    startMove(world, 'ganchoUrso');
    const states = new Set<string>();
    for (let frame = 0; frame < 60; frame += 1) {
      world.step(empty, empty);
      states.add(world.fighters[1].state);
    }
    expect(states.has('grabbedFront')).toBe(false);
    expect(states.has('grabbedLifted')).toBe(false);
    expect(states.has('thrown')).toBe(false);
    expect(world.fighters[1].health).toBe(rafaMare.stats.maxHealth);
  });

  it.each([rafaMare, astroRiso, gutoBarba, danteSinal])('Abraço alinha $name e sustenta frozen sem oscilação', (victim) => {
    const world = setupWorld(victim);
    startMove(world, 'abracoGlacial');
    let frozenFrames = 0;
    let frozenX: number | null = null;
    let sawThrown = false;
    for (let frame = 0; frame < 220; frame += 1) {
      const snapshot = world.snapshot();
      if (snapshot.fighters[1].state === 'frozen') {
        frozenFrames += 1;
        frozenX ??= snapshot.fighters[1].x;
        world.step(empty, input(['left', 'up', 'light', 'heavy', 'special', 'block'], ['up', 'light']));
        expect(world.fighters[1].currentMove).toBeNull();
        expect(world.fighters[1].x).toBeCloseTo(frozenX);
        continue;
      }
      sawThrown ||= snapshot.fighters[1].state === 'thrown';
      world.step(empty, empty);
    }
    const hits = world.drainEvents().filter(({ type, moveId }) => type === 'hit' && moveId === 'abracoGlacial');
    expect(frozenFrames).toBe(63);
    expect(sawThrown).toBe(true);
    expect(hits).toHaveLength(1);
    expect(world.fighters[1].health).toBe(victim.stats.maxHealth - 280);
    expect(world.fighters[1].freezeEffectFrames).toBe(0);
  });

  it.each([1, -1] as const)('Abraço com Dante cobre grabbedFront 0–7, frozen e libera (facing %s)', (facing) => {
    const grab = gutoBarba.moves.abracoGlacial!.grab!;
    const victimAsset = getFighterSpriteAsset('dante-sinal')!;
    for (const entry of grab.victimTimeline ?? []) {
      if (entry.state !== 'grabbedFront' && entry.state !== 'frozen') continue;
      const animId = entry.state === 'grabbedFront' ? 'grabbedFront' : 'frozen';
      expect(entry.poseFrame).toBeLessThan(victimAsset.animations[animId].frames);
    }

    const world = setupWorld(danteSinal, facing);
    const health = world.fighters[1].health;
    startMove(world, 'abracoGlacial');
    const frontPoses = new Set<number>();
    let frozenFrames = 0;
    let sawThrown = false;

    for (let frame = 0; frame < 240; frame += 1) {
      const snap = world.snapshot();
      const victim = snap.fighters[1];
      if (victim.state === 'grabbedFront' && victim.victimPoseFrame !== null) {
        frontPoses.add(victim.victimPoseFrame);
        const resolved = resolveFighterAnimation(victim, null, victimAsset, danteSinal);
        expect(resolved.explicitFrame).toBeLessThan(victimAsset.animations.grabbedFront.frames);
      }
      if (victim.state === 'frozen') {
        frozenFrames += 1;
        const resolved = resolveFighterAnimation(victim, null, victimAsset, danteSinal);
        expect(resolved.explicitFrame ?? 0).toBeLessThan(victimAsset.animations.frozen.frames);
        world.step(empty, input(['left', 'up', 'light'], ['up', 'light']));
        continue;
      }
      sawThrown ||= victim.state === 'thrown';
      world.step(empty, empty);
    }

    // Pose 0 pode ser engolida pelo hit-stop; 1–7 e o pico 7 precisam existir.
    expect(Math.max(...frontPoses)).toBe(7);
    for (let pose = 1; pose <= 7; pose += 1) expect(frontPoses.has(pose)).toBe(true);
    expect(frozenFrames).toBe(63);
    expect(sawThrown).toBe(true);
    const hits = world.drainEvents().filter(({ type, moveId }) => type === 'hit' && moveId === 'abracoGlacial');
    expect(hits).toHaveLength(1);
    expect(world.fighters[1].health).toBe(health - 280);
    expect(world.fighters[1].freezeEffectFrames).toBe(0);
    expect(world.fighters[1].grabbedBy).toBeNull();
    expect(world.snapshot().activeGrab).toBeNull();

    const frameBefore = world.frame;
    world.step(input(['left'], ['heavy']), empty);
    expect(world.frame).toBe(frameBefore + 1);
  });

  it('sincroniza os 45 frames do efeito e só libera depois do congelamento', () => {
    const move = gutoBarba.moves.abracoGlacial!;
    const effect = gutoBarbaSpriteAsset.effects.find(({ id }) => id === 'abraco-glacial');
    expect(move.totalFrames).toBe(110);
    expect(move.grab?.releaseFrame).toBe(91);
    expect(move.grab?.victimTimeline?.find(({ state }) => state === 'frozen')?.frame).toBe(28);
    expect(effect?.activeRange).toEqual({ from: 28, to: 94 });
    expect(effect?.frames).toBe(12);
    const fullIceFrames = effect?.frameTimeline
      ?.filter(({ frame }) => frame === 5 || frame === 6)
      .reduce((total, { range }) => total + range.to - range.from + 1, 0);
    expect(fullIceFrames).toBe(45);
    expect(move.hitboxes[0]?.boxes[0]?.freezeFrames).toBeUndefined();
  });

  it('consome energia uma vez, bloqueia sem energia e limpa reset de treinamento', () => {
    const noMeter = new FighterRuntime(gutoBarba, 200, 1);
    noMeter.beginFrame(input(['down', 'special'], ['special']), 1, 400);
    expect(noMeter.currentMove).toBeNull();

    const paid = setupWorld(rafaMare);
    startMove(paid, 'abracoGlacial');
    expect(paid.fighters[0].meter).toBe(0);
    runFrames(paid, 120);
    expect(paid.fighters[0].meter).toBe(0);

    const training = setupWorld(rafaMare, 1, 'training');
    startMove(training, 'abracoGlacial');
    snapshotAtAttackerFrame(training, 35);
    expect(training.snapshot().activeGrab).not.toBeNull();
    training.resetTrainingPositions();
    expect(training.snapshot().activeGrab).toBeNull();
    expect(training.fighters[1]).toMatchObject({ grabbedBy: null, freezeEffectFrames: 0, state: 'idle' });
  });

  it('Abraço errado não congela nem causa dano', () => {
    const world = setupWorld(rafaMare);
    world.fighters[1].x = 470;
    startMove(world, 'abracoGlacial');
    const states = new Set<string>();
    for (let frame = 0; frame < 130; frame += 1) {
      world.step(empty, empty);
      states.add(world.fighters[1].state);
    }
    expect(states.has('frozen')).toBe(false);
    expect(world.fighters[1].health).toBe(rafaMare.stats.maxHealth);
  });
});
