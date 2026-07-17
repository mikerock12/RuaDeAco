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
    expect(resolveGutoGrab(gancho, 8, 'none').id).toBe('special2');
    expect(resolveGutoGrab(gancho, 9, 'none').id).toBe('special2Grab');
    expect(resolveGutoGrab(gancho, 12, 'none').id).toBe('special2Recovery');
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
    const frames = Array.from({ length: 4 }, (_, victimPhaseFrame) => {
      const resolved = resolveFighterAnimation(
        snapshot(rafaMare, 'grabbedFront', victimPhaseFrame, {
          grabbedBy: 'guto-barba',
          victimPhaseFrame,
          victimPhaseFrames: 4,
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
    expect(frames).toEqual([0, 1, 2, 3]);
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
