import { describe, expect, it } from 'vitest';
import { moveAnimationFrameIndex } from '../../../assets/spriteSheetContract';
import { CombatWorld } from '../../../combat/CombatWorld';
import { intersects, toWorldRect } from '../../../combat/geometry';
import { combatStateHash } from '../../../online/stateHash';
import type { FighterRuntime } from '../../../combat/FighterRuntime';
import type { InputFrame, MoveDefinition } from '../../../types/combat';
import { FIGHTERS } from '../../index';
import { getFighterSpriteAsset } from '../../visual';
import {
  COLLISION_RESPONSE_MARGIN,
  FIGHTER_COLLISION_PROFILES,
  activeHitboxesAtFrame,
  buildCalibratedMoveHitboxes,
  getFighterCollisionProfile,
} from '../collisionProfiles';

const empty: InputFrame = {
  held: new Set(), pressed: new Set(), released: new Set(),
};

const NORMAL_ANIMATIONS = new Set([
  'standingLight', 'standingHeavy', 'crouchLight', 'forwardLight',
  'crouchHeavy', 'forwardHeavy', 'airLightNeutral', 'airHeavyNeutral',
  'airLightForward', 'airHeavyForward', 'airLightBackward', 'airHeavyBackward',
]);

function forceMove(fighter: FighterRuntime, move: MoveDefinition): void {
  (fighter as unknown as { startMove(value: MoveDefinition): void }).startMove(move);
}

function enterFight(world: CombatWorld): void {
  for (let frame = 0; frame < 105; frame += 1) world.step(empty, empty);
  world.drainEvents();
}

describe('metadata raster/colisão v1', () => {
  it('cobre os seis lutadores, os 72 normais e todo golpe corporal ofensivo', () => {
    expect(Object.keys(FIGHTER_COLLISION_PROFILES)).toHaveLength(6);
    let normalCount = 0;
    for (const fighter of FIGHTERS) {
      const profile = getFighterCollisionProfile(fighter.id);
      expect(profile?.version).toBe(1);
      const normals = Object.values(fighter.moves)
        .filter(({ animation }) => NORMAL_ANIMATIONS.has(animation));
      expect(normals, fighter.id).toHaveLength(12);
      normalCount += normals.length;

      for (const move of Object.values(fighter.moves)) {
        if (move.hitboxes.length === 0) continue;
        const calibrated = buildCalibratedMoveHitboxes(fighter.id, move);
        expect(calibrated, `${fighter.id}/${move.id}`).toHaveLength(move.hitboxes.length);
        expect(profile?.moves[move.id], `${fighter.id}/${move.id}`).toBeDefined();
      }
    }
    expect(normalCount).toBe(72);
  });

  it('mantém ranges ordenados, inequívocos e caixas finitas/plausíveis', () => {
    for (const fighter of FIGHTERS) {
      for (const move of Object.values(fighter.moves)) {
        const phases = buildCalibratedMoveHitboxes(fighter.id, move);
        let previousTo = -1;
        for (const phase of phases) {
          expect(phase.range.from, `${fighter.id}/${move.id}`).toBeGreaterThan(previousTo);
          expect(phase.range.to).toBeGreaterThanOrEqual(phase.range.from);
          expect(phase.range.to).toBeLessThan(move.totalFrames);
          previousTo = phase.range.to;
          expect(phase.boxes.length).toBeGreaterThan(0);
          for (const box of phase.boxes) {
            for (const value of [box.x, box.y, box.width, box.height]) {
              expect(Number.isFinite(value), `${fighter.id}/${move.id}`).toBe(true);
            }
            expect(box.width).toBeGreaterThan(0);
            expect(box.height).toBeGreaterThan(0);
            expect(box.x).toBeGreaterThanOrEqual(-180);
            expect(box.x + box.width).toBeLessThanOrEqual(180);
            expect(box.y).toBeGreaterThanOrEqual(-260);
            expect(box.y + box.height).toBeLessThanOrEqual(20);
          }
        }
      }
    }
  });

  it('resolve activeFrom-1/from/to/to+1 sem off-by-one', () => {
    for (const fighter of FIGHTERS) {
      for (const move of Object.values(fighter.moves)) {
        for (const phase of buildCalibratedMoveHitboxes(fighter.id, move)) {
          expect(activeHitboxesAtFrame([phase], phase.range.from - 1)).toEqual([]);
          expect(activeHitboxesAtFrame([phase], phase.range.from).length).toBeGreaterThan(0);
          expect(activeHitboxesAtFrame([phase], phase.range.to).length).toBeGreaterThan(0);
          expect(activeHitboxesAtFrame([phase], phase.range.to + 1)).toEqual([]);
        }
      }
    }
  });

  it('espelha exatamente e acerta na margem, mas erra 1 px além', () => {
    expect(COLLISION_RESPONSE_MARGIN).toBe(3);
    for (const fighter of FIGHTERS) {
      for (const move of Object.values(fighter.moves)) {
        for (const phase of buildCalibratedMoveHitboxes(fighter.id, move)) {
          for (const box of phase.boxes) {
            const right = toWorldRect(box, { id: fighter.id, x: 300, y: 320, facing: 1 });
            const left = toWorldRect(box, { id: fighter.id, x: 300, y: 320, facing: -1 });
            expect(left.x).toBe(600 - right.x - right.width);
            expect(left.y).toBe(right.y);
            expect(left.width).toBe(right.width);

            const contactRight = { x: right.x + right.width - 1, y: right.y, width: 8, height: right.height };
            const outsideRight = { ...contactRight, x: right.x + right.width + 1 };
            expect(intersects(right, contactRight)).toBe(true);
            expect(intersects(right, outsideRight)).toBe(false);

            const contactLeft = { x: left.x - 7, y: left.y, width: 8, height: left.height };
            const outsideLeft = { ...contactLeft, x: left.x - 9 };
            expect(intersects(left, contactLeft)).toBe(true);
            expect(intersects(left, outsideLeft)).toBe(false);
          }
        }
      }
    }
  });

  it('usa no snapshot o mesmo stateFrame avaliado pelo combate/debug', () => {
    for (const fighter of FIGHTERS) {
      const move = Object.values(fighter.moves).find(({ animation }) => animation === 'standingLight')!;
      const world = new CombatWorld(fighter, FIGHTERS.find(({ id }) => id !== fighter.id)!, 'versus');
      enterFight(world);
      forceMove(world.fighters[0], move);
      const activeFrom = move.hitboxes[0]!.range.from;
      for (let frame = 0; frame <= activeFrom; frame += 1) world.step(empty, empty);
      const snapshot = world.snapshot().fighters[0];
      expect(snapshot.poseStateFrame).toBe(activeFrom);
      expect(snapshot.stateFrame).toBe(activeFrom + 1);
      expect(world.fighters[0].getEvaluatedHitboxes().length).toBeGreaterThan(0);
      const asset = getFighterSpriteAsset(fighter.id)!;
      const animation = Object.values(asset.animations)
        .find(({ id }) => id === move.animation)!;
      expect(moveAnimationFrameIndex(move, snapshot.poseStateFrame, animation.frames)).toBe(2);
    }
  });

  it('invalida a pose capturada ao resetar e não reutiliza caixas antigas', () => {
    const world = new CombatWorld(FIGHTERS[0]!, FIGHTERS[1]!, 'training');
    enterFight(world);
    const move = Object.values(world.fighters[0].definition.moves)
      .find(({ animation }) => animation === 'standingLight')!;
    forceMove(world.fighters[0], move);
    world.step(empty, empty);
    expect(world.snapshot().fighters[0].poseMoveId).toBe(move.id);

    world.resetTrainingPositions();
    const reset = world.snapshot().fighters[0];
    expect(reset.poseState).toBe('idle');
    expect(reset.poseStateFrame).toBe(0);
    expect(reset.poseMoveId).toBeNull();
    expect(world.fighters[0].getEvaluatedHitboxes()).toEqual([]);
  });

  it('rejeita projétil após KO mesmo com hurtbox capturada no início do passo', () => {
    const world = new CombatWorld(FIGHTERS[0]!, FIGHTERS[1]!, 'versus');
    enterFight(world);
    const target = world.fighters[1];
    const projectile = Object.values(FIGHTERS.find(({ projectiles }) =>
      Object.keys(projectiles ?? {}).length > 0)!.projectiles!)[0]!.hitbox;

    target.captureCollisionPose();
    expect(target.getEvaluatedHurtboxes().length).toBeGreaterThan(0);
    expect(target.canReceiveHitbox(projectile)).toBe(true);
    target.setMatchState('knockout');
    expect(target.canReceiveHitbox(projectile)).toBe(false);
  });

  it('preserva IDs de impacto: contínuos repetem; multi-hit usa IDs distintos', () => {
    for (const fighter of FIGHTERS) {
      for (const move of Object.values(fighter.moves)) {
        const phases = buildCalibratedMoveHitboxes(fighter.id, move);
        for (const phase of phases) {
          const ids = new Set(phase.boxes.map(({ id }) => id));
          expect(ids.size, `${fighter.id}/${move.id}`).toBe(1);
          for (let frame = phase.range.from; frame <= phase.range.to; frame += 1) {
            expect(new Set(activeHitboxesAtFrame(phases, frame).map(({ id }) => id))).toEqual(ids);
          }
        }
        if (phases.length > 1) {
          const phaseIds = phases.map((phase) => phase.boxes[0]!.id);
          expect(new Set(phaseIds).size, `${fighter.id}/${move.id}`).toBe(phaseIds.length);
        }
      }
    }
  });

  it('não cria ofensiva para parry, fumaça ou buffs', () => {
    const withoutBodyHit = [
      ['noir-reflexo', 'reflexoNegro'],
      ['dante-sinal', 'bombaFumaca'],
      ['rafa-mare', 'ecoTatuado'],
    ] as const;
    for (const [fighterId, moveId] of withoutBodyHit) {
      const fighter = FIGHTERS.find(({ id }) => id === fighterId)!;
      expect(fighter.moves[moveId]?.hitboxes).toEqual([]);
    }
  });
});

describe('compatibilidade real 6 x 6 e determinismo', () => {
  for (const attackerDefinition of FIGHTERS) {
    for (const defenderDefinition of FIGHTERS) {
      it(`${attackerDefinition.id} acerta ${defenderDefinition.id} e mantém dois hashes`, () => {
        const worlds = [
          new CombatWorld(attackerDefinition, defenderDefinition, 'versus'),
          new CombatWorld(attackerDefinition, defenderDefinition, 'versus'),
        ] as const;
        worlds.forEach(enterFight);
        const move = Object.values(attackerDefinition.moves)
          .find(({ animation }) => animation === 'standingLight')!;
        const calibrated = buildCalibratedMoveHitboxes(attackerDefinition.id, move)[0]!;
        const hitRight = Math.max(...calibrated.boxes.map((box) => box.x + box.width));
        const attackTop = Math.min(...calibrated.boxes.map(({ y }) => y));
        const attackBottom = Math.max(...calibrated.boxes.map(({ y, height }) => y + height));
        const verticalTargets = getFighterCollisionProfile(defenderDefinition.id)!
          .poses.standing.hurtboxes.filter(({ y, height }) =>
            attackBottom > y && attackTop < y + height);
        expect(verticalTargets.length).toBeGreaterThan(0);
        const hurtLeft = Math.min(...verticalTargets.map(({ x }) => x));

        for (const world of worlds) {
          world.fighters[0].x = 300;
          world.fighters[1].x = 300 + hitRight - hurtLeft - 1;
          world.fighters[0].facing = 1;
          world.fighters[1].facing = -1;
          forceMove(world.fighters[0], move);
        }

        const before = worlds[0].fighters[1].health;
        let hitCheckpoint = -1;
        const hashes: string[] = [];
        for (let frame = 0; frame < move.totalFrames + 24; frame += 1) {
          worlds[0].step(empty, empty);
          worlds[1].step(empty, empty);
          expect(combatStateHash(worlds[0])).toBe(combatStateHash(worlds[1]));
          expect(worlds[0].drainEvents()).toEqual(worlds[1].drainEvents());
          if (hitCheckpoint < 0 && worlds[0].fighters[1].health < before) hitCheckpoint = frame;
          if (hitCheckpoint >= 0 && (frame === hitCheckpoint + 8 || frame === hitCheckpoint + 16)) {
            hashes.push(combatStateHash(worlds[0]));
            expect(worlds[0].snapshot().fighters).toEqual(worlds[1].snapshot().fighters);
          }
        }
        expect(worlds[0].fighters[1].health).toBeLessThan(before);
        expect(hashes).toHaveLength(2);
        expect(JSON.stringify(worlds[0].exportDeterministicState())).not.toContain('collisionProfiles');
      });
    }
  }

  it.each([
    ['multi-hit', 'astro-riso', 'rafa-mare', 'rajadaNeon', 350, 100, 4],
    ['projétil', 'rafa-mare', 'guto-barba', 'maoDaMare', 480, 120, 1],
    ['grab', 'guto-barba', 'dante-sinal', 'ganchoUrso', 330, 100, 1],
  ] as const)(
    'mantém vida, posição, eventos e hash com impacto real de %s',
    (_kind, attackerId, defenderId, moveId, defenderX, steps, expectedHits) => {
      const attacker = FIGHTERS.find(({ id }) => id === attackerId)!;
      const defender = FIGHTERS.find(({ id }) => id === defenderId)!;
      const move = attacker.moves[moveId]!;
      const worlds = [
        new CombatWorld(attacker, defender, 'online'),
        new CombatWorld(attacker, defender, 'online'),
      ] as const;
      worlds.forEach(enterFight);
      for (const world of worlds) {
        world.fighters[0].x = 300;
        world.fighters[1].x = defenderX;
        world.fighters[0].facing = 1;
        world.fighters[1].facing = -1;
        forceMove(world.fighters[0], move);
      }

      let impactStep = -1;
      let hitCount = 0;
      const checkpoints: number[] = [];
      for (let step = 0; step < steps; step += 1) {
        worlds[0].step(empty, empty);
        worlds[1].step(empty, empty);
        const firstEvents = worlds[0].drainEvents();
        const secondEvents = worlds[1].drainEvents();
        expect(firstEvents).toEqual(secondEvents);
        const hits = firstEvents.filter((event) => event.type === 'hit' && event.moveId === moveId);
        hitCount += hits.length;
        if (impactStep < 0 && hits.length > 0) impactStep = step;

        expect(combatStateHash(worlds[0])).toBe(combatStateHash(worlds[1]));
        expect(worlds[0].fighters[1].health).toBe(worlds[1].fighters[1].health);
        expect(worlds[0].fighters.map(({ x, y }) => ({ x, y })))
          .toEqual(worlds[1].fighters.map(({ x, y }) => ({ x, y })));
        if (impactStep >= 0 && (step === impactStep + 8 || step === impactStep + 16)) {
          checkpoints.push(step);
          expect(worlds[0].snapshot().fighters).toEqual(worlds[1].snapshot().fighters);
        }
      }

      expect(hitCount).toBe(expectedHits);
      expect(checkpoints).toHaveLength(2);
    },
  );
});
