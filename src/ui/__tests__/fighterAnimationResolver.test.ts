import { describe, expect, it } from 'vitest';
import { spriteSheetFrameIndex } from '../../assets/spriteSheetContract';
import { FighterRuntime, type FighterSnapshot } from '../../combat/FighterRuntime';
import { astroRiso } from '../../fighters/astroRiso';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import {
  astroRisoSpriteAsset,
  gutoBarbaSpriteAsset,
  rafaMareSpriteAsset,
} from '../../fighters/visual';
import type { FighterState, MoveDefinition } from '../../types/combat';
import {
  resolveAttachedEffect,
  resolveAttachedEffectFrame,
  resolveFighterAnimation,
} from '../fighterAnimationResolver';

function snapshot(
  fighter: typeof rafaMare | typeof astroRiso | typeof gutoBarba,
  state: FighterState,
  stateFrame: number,
  patch: Partial<FighterSnapshot> = {},
): FighterSnapshot {
  return {
    ...new FighterRuntime(fighter, 200, 1).snapshot(),
    state,
    stateFrame,
    ...patch,
  };
}

function resolveGutoGrab(
  move: MoveDefinition,
  stateFrame: number,
  moveConnected: FighterSnapshot['moveConnected'],
) {
  return resolveFighterAnimation(
    snapshot(gutoBarba, 'specialAttack', stateFrame, {
      activeMoveId: move.id,
      moveConnected,
    }),
    move,
    gutoBarbaSpriteAsset,
    gutoBarba,
  );
}

describe('fighterAnimationResolver', () => {
  it('usa impacto no frame 2 e alcança recuperação nos golpes não faseados', () => {
    const light = rafaMare.moves.lightPunch!;
    const active = resolveFighterAnimation(
      snapshot(rafaMare, 'lightAttack', light.hitboxes[0]!.range.from, {
        activeMoveId: light.id,
      }),
      light,
      rafaMareSpriteAsset,
      rafaMare,
    );
    const recovery = resolveFighterAnimation(
      snapshot(rafaMare, 'lightAttack', light.totalFrames - 1, {
        activeMoveId: light.id,
      }),
      light,
      rafaMareSpriteAsset,
      rafaMare,
    );
    expect(active).toMatchObject({ id: 'standingLight', explicitFrame: 2 });
    expect(recovery).toMatchObject({ id: 'standingLight', explicitFrame: 3 });
  });

  it('em whiff mantém startup e pula hold/freeze/throw para recovery', () => {
    const gancho = gutoBarba.moves.ganchoUrso!;
    expect(resolveGutoGrab(gancho, 7, 'none').id).toBe('special2');
    expect(resolveGutoGrab(gancho, 8, 'none').id).toBe('special2Grab');
    expect(resolveGutoGrab(gancho, 11, 'none').id).toBe('special2Recovery');
    expect(resolveGutoGrab(gancho, 20, 'none').id).toBe('special2Recovery');
    expect(resolveGutoGrab(gancho, 20, 'hit').id).toBe('special2Hold');

    const abraco = gutoBarba.moves.abracoGlacial!;
    const whiff = resolveGutoGrab(abraco, 40, 'none');
    expect(whiff.id).toBe('special3Finish');
    expect(resolveGutoGrab(abraco, 40, 'hit').id).toBe('special3Freeze');

    const whiffSnapshot = snapshot(gutoBarba, 'specialAttack', 40, {
      activeMoveId: abraco.id,
      moveConnected: 'none',
    });
    const hitSnapshot = { ...whiffSnapshot, moveConnected: 'hit' as const };
    expect(resolveAttachedEffect(whiffSnapshot, abraco, gutoBarbaSpriteAsset)).toBeUndefined();
    expect(resolveAttachedEffect(hitSnapshot, abraco, gutoBarbaSpriteAsset)?.id)
      .toBe('abraco-glacial');
  });

  it('distribui todos os frames dentro da fase curta da própria vítima', () => {
    const frames = Array.from({ length: 8 }, (_, victimPhaseFrame) => {
      const resolved = resolveFighterAnimation(
        snapshot(rafaMare, 'grabbedFront', victimPhaseFrame, {
          grabbedBy: 'guto-barba',
          victimPhaseFrame,
          victimPhaseFrames: 8,
        }),
        null,
        rafaMareSpriteAsset,
        rafaMare,
      );
      return spriteSheetFrameIndex(
        rafaMareSpriteAsset.animations.grabbedFront,
        resolved.localFrame,
        resolved.phaseFrames,
      );
    });
    expect(frames).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('distribui os quatro frames em cada metade do arco de pulo', () => {
    for (const state of ['jump', 'fall'] as const) {
      const initial = resolveFighterAnimation(
        snapshot(rafaMare, state, 0),
        null,
        rafaMareSpriteAsset,
        rafaMare,
      );
      const duration = initial.phaseFrames!;
      const reached = new Set(Array.from({ length: duration }, (_, stateFrame) => {
        const resolved = resolveFighterAnimation(
          snapshot(rafaMare, state, stateFrame),
          null,
          rafaMareSpriteAsset,
          rafaMare,
        );
        return spriteSheetFrameIndex(
          rafaMareSpriteAsset.animations[resolved.id]!,
          resolved.localFrame,
          resolved.phaseFrames,
        );
      }));
      expect(reached).toEqual(new Set([0, 1, 2, 3]));
    }
  });

  it('preserva a direção no primeiro quadro do pulo e cobre todo o wake-up', () => {
    const forward = resolveFighterAnimation(
      snapshot(rafaMare, 'jump', 0, { airDriftX: rafaMare.stats.jumpForwardSpeed }),
      null,
      rafaMareSpriteAsset,
      rafaMare,
    );
    expect(forward.id).toBe('jumpForward');

    for (const [fighter, asset] of [
      [rafaMare, rafaMareSpriteAsset],
      [astroRiso, astroRisoSpriteAsset],
      [gutoBarba, gutoBarbaSpriteAsset],
    ] as const) {
      const reached = new Set(Array.from({ length: 22 }, (_, stateFrame) => {
        const resolved = resolveFighterAnimation(
          snapshot(fighter, 'wakeUp', stateFrame),
          null,
          asset,
          fighter,
        );
        return spriteSheetFrameIndex(
          asset.animations.wakeUp,
          resolved.localFrame,
          resolved.phaseFrames,
        );
      }));
      expect(reached).toEqual(new Set([0, 1, 2, 3]));
    }
  });

  it('mantém o corpo congelado na paleta neutra enquanto o efeito separado anima', () => {
    const resolved = resolveFighterAnimation(
      snapshot(rafaMare, 'frozen', 22, {
        grabbedBy: 'guto-barba',
        victimPhaseFrame: 22,
        victimPhaseFrames: 45,
      }),
      null,
      rafaMareSpriteAsset,
      rafaMare,
    );
    expect(resolved).toMatchObject({ id: 'frozen', explicitFrame: 0 });
  });

  it('alcança cada frame corporal declarado e mapeia as 12 fases do gelo', () => {
    for (const move of [gutoBarba.moves.ganchoUrso!, gutoBarba.moves.abracoGlacial!]) {
      const reached = new Map<string, Set<number>>();
      for (let stateFrame = 0; stateFrame < move.totalFrames; stateFrame += 1) {
        const resolved = resolveGutoGrab(move, stateFrame, 'hit');
        const animation = gutoBarbaSpriteAsset.animations[resolved.id]!;
        const frame = resolved.explicitFrame
          ?? spriteSheetFrameIndex(animation, resolved.localFrame, resolved.phaseFrames);
        const frames = reached.get(resolved.id) ?? new Set<number>();
        frames.add(frame);
        reached.set(resolved.id, frames);
      }
      for (const phase of gutoBarbaSpriteAsset.movePhases[move.id] ?? []) {
        const animation = gutoBarbaSpriteAsset.animations[phase.animation]!;
        expect(reached.get(phase.animation), phase.animation)
          .toEqual(new Set(Array.from({ length: animation.frames }, (_, frame) => frame)));
      }
    }

    const effect = gutoBarbaSpriteAsset.effects.find(({ id }) => id === 'abraco-glacial')!;
    const reachedEffectFrames = new Set<number>();
    for (let frame = effect.activeRange!.from; frame <= effect.activeRange!.to; frame += 1) {
      reachedEffectFrames.add(resolveAttachedEffectFrame(effect, frame));
    }
    expect(reachedEffectFrames).toEqual(new Set(Array.from({ length: 12 }, (_, frame) => frame)));
    const stable = Array.from({ length: 45 }, (_, index) =>
      resolveAttachedEffectFrame(effect, index + 33));
    expect(stable.every((frame) => frame === 5 || frame === 6)).toBe(true);
  });

  it('alinha o frame visual de impacto dos três especiais do Astro', () => {
    for (const move of [
      astroRiso.moves.sorrisoRelampago!,
      astroRiso.moves.rajadaNeon!,
      astroRiso.moves.astroGiro!,
    ]) {
      const firstImpact = move.hitboxes[0]!.range.from;
      const resolved = resolveFighterAnimation(
        snapshot(astroRiso, 'specialAttack', firstImpact, { activeMoveId: move.id }),
        move,
        astroRisoSpriteAsset,
        astroRiso,
      );
      expect(resolved.explicitFrame, move.id).toBe(2);
    }
  });
});
