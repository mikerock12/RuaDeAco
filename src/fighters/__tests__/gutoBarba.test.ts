import { describe, expect, it } from 'vitest';
import { CombatWorld } from '../../combat/CombatWorld';
import { FighterRuntime } from '../../combat/FighterRuntime';
import { astroRiso } from '../astroRiso';
import { gutoBarba } from '../gutoBarba';
import { rafaMare } from '../rafaMare';
import type { FighterDefinition, InputAction, InputFrame } from '../../types/combat';
import { gutoBarbaSpriteAsset } from '../visual/gutoBarbaSprite';

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

  it.each([rafaMare, astroRiso, gutoBarba])('Gancho separa, alinha e arremessa $name uma única vez', (victim) => {
    const world = setupWorld(victim);
    startMove(world, 'ganchoUrso');
    const front = snapshotAtAttackerFrame(world, 10);
    expect(front.fighters[1]).toMatchObject({ state: 'grabbedFront', grabbedBy: 'guto-barba' });
    expect(front.fighters[0].grabbedBy).toBeNull();

    const hold = snapshotAtAttackerFrame(world, 13);
    const offset = gutoBarba.moves.ganchoUrso!.grab!.victimOffsets?.[victim.id];
    expect(hold.fighters[1]).toMatchObject({ state: 'grabbedLifted', grabbedBy: 'guto-barba' });
    expect(hold.fighters[1].x).toBeCloseTo(
      hold.fighters[0].x - 20 + (offset?.anchorOffsetX ?? 0),
    );
    expect(hold.fighters[1].victimRotation).toBeCloseTo(1.05 + (offset?.rotationOffset ?? 0));

    runFrames(world, 100);
    const hits = world.drainEvents().filter(({ type, moveId }) => type === 'hit' && moveId === 'ganchoUrso');
    expect(hits).toHaveLength(1);
    expect(world.fighters[1].health).toBe(victim.stats.maxHealth - 155);
    expect(world.snapshot().activeGrab).toBeNull();
  });

  it('espelha a âncora do Gancho ao trocar de lado', () => {
    const world = setupWorld(rafaMare, -1);
    startMove(world, 'ganchoUrso');
    const hold = snapshotAtAttackerFrame(world, 13);
    expect(hold.fighters[1].x).toBeCloseTo(hold.fighters[0].x + 20);
    expect(hold.fighters[1].victimRotation).toBeCloseTo(-1.05);
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

  it.each([rafaMare, astroRiso, gutoBarba])('Abraço alinha $name e sustenta frozen por 45 frames', (victim) => {
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
    expect(frozenFrames).toBe(45);
    expect(sawThrown).toBe(true);
    expect(hits).toHaveLength(1);
    expect(world.fighters[1].health).toBe(victim.stats.maxHealth - 280);
    expect(world.fighters[1].freezeEffectFrames).toBe(0);
  });

  it('sincroniza os 45 frames do efeito e só libera depois do congelamento', () => {
    const move = gutoBarba.moves.abracoGlacial!;
    const effect = gutoBarbaSpriteAsset.effects.find(({ id }) => id === 'abraco-glacial');
    expect(move.totalFrames).toBe(94);
    expect(move.grab?.releaseFrame).toBe(80);
    const frozenPhases = move.grab?.victimPhases?.filter(({ state }) => state === 'frozen') || [];
    const firstFrozen = frozenPhases[0]?.range.from;
    const lastFrozen = frozenPhases[frozenPhases.length - 1]?.range.to;
    expect(firstFrozen).toBe(35);
    expect(lastFrozen).toBe(79);
    expect(effect?.activeRange).toEqual({ from: 35, to: 79 });
    expect((effect!.activeRange!.to - effect!.activeRange!.from + 1)).toBe(45);
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
