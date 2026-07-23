import {
  jumpArcPhaseFrames,
  moveAnimationFrameIndex,
  spriteSheetFrameIndex,
} from '../assets/spriteSheetContract';
import type { FighterSnapshot } from '../combat/FighterRuntime';
import { LANDING_FRAMES, WAKE_UP_FRAMES } from '../config/gameConfig';
import type { FighterDefinition, FighterState, MoveDefinition } from '../types/combat';
import type { FighterAnimationId, FighterEffectAsset, FighterSpriteAsset } from '../types/assets';

export interface ResolvedFighterAnimation {
  readonly id: FighterAnimationId;
  readonly localFrame: number;
  readonly phaseFrames?: number;
  readonly explicitFrame?: number;
}

function whiffedGrabAnimation(
  snapshot: FighterSnapshot,
  move: MoveDefinition,
  asset: FighterSpriteAsset,
): ResolvedFighterAnimation | null {
  const phases = asset.movePhases[move.id];
  if (!move.grab || !phases || phases.length === 0 || snapshot.moveConnected !== 'none') {
    return null;
  }

  const activeTo = Math.max(...move.hitboxes.map(({ range }) => range.to), 0);
  if (snapshot.stateFrame <= activeTo) {
    const attemptPhase = phases.find(({ range }) =>
      snapshot.stateFrame >= range.from && snapshot.stateFrame <= range.to);
    if (attemptPhase) {
      return {
        id: attemptPhase.animation,
        localFrame: snapshot.stateFrame - attemptPhase.range.from,
        phaseFrames: Math.min(activeTo, attemptPhase.range.to) - attemptPhase.range.from + 1,
      };
    }
    return {
      id: move.animation as FighterAnimationId,
      localFrame: snapshot.stateFrame,
      phaseFrames: activeTo + 1,
    };
  }

  const recovery = phases[phases.length - 1];
  if (!recovery) return null;
  return {
    id: recovery.animation,
    localFrame: snapshot.stateFrame - activeTo - 1,
    phaseFrames: Math.max(1, move.totalFrames - activeTo - 1),
  };
}

export function resolveFighterAnimation(
  snapshot: FighterSnapshot,
  activeMove: MoveDefinition | null,
  asset: FighterSpriteAsset,
  definition: FighterDefinition,
): ResolvedFighterAnimation {
  if (activeMove) {
    const whiff = whiffedGrabAnimation(snapshot, activeMove, asset);
    if (whiff) return whiff;

    const phase = asset.movePhases[activeMove.id]
      ?.find(({ range }) => snapshot.stateFrame >= range.from && snapshot.stateFrame <= range.to);
    if (phase) {
      return {
        id: phase.animation,
        localFrame: snapshot.stateFrame - phase.range.from,
        phaseFrames: phase.range.to - phase.range.from + 1,
        ...(phase.explicitFrame !== undefined ? { explicitFrame: phase.explicitFrame } : {}),
      };
    }

    const id = activeMove.animation as FighterAnimationId;
    const animation = asset.animations[id];
    return {
      id,
      localFrame: snapshot.stateFrame,
      ...(animation
        ? { explicitFrame: moveAnimationFrameIndex(activeMove, snapshot.stateFrame, animation.frames) }
        : {}),
    };
  }

  const state: FighterState = snapshot.state;
  if (state === 'lightAttack') return { id: 'standingLight', localFrame: snapshot.stateFrame };
  if (state === 'heavyAttack' || state === 'kickAttack') {
    return { id: 'standingHeavy', localFrame: snapshot.stateFrame };
  }
  if (state === 'specialAttack') return { id: 'special1', localFrame: snapshot.stateFrame };
  if (state === 'walkForward') return { id: 'walk', localFrame: snapshot.stateFrame };
  if (state === 'walkBackward') return { id: 'walkBackward', localFrame: snapshot.stateFrame };
  if (state === 'jump') {
    const relativeMotion = snapshot.airDriftX * snapshot.facing;
    const id = relativeMotion > 0.01
      ? 'jumpForward'
      : relativeMotion < -0.01 ? 'jumpBackward' : 'jumpNeutral';
    return {
      id,
      localFrame: snapshot.stateFrame,
      phaseFrames: jumpArcPhaseFrames(definition.stats),
    };
  }
  if (state === 'fall') {
    return {
      id: 'fall',
      localFrame: snapshot.stateFrame,
      phaseFrames: jumpArcPhaseFrames(definition.stats),
    };
  }
  if (state === 'landing') {
    return { id: 'landing', localFrame: snapshot.stateFrame, phaseFrames: LANDING_FRAMES };
  }
  if (state === 'crouch') return { id: 'crouch', localFrame: snapshot.stateFrame };
  if (state === 'blockStanding') return { id: 'blockStanding', localFrame: snapshot.stateFrame };
  if (state === 'blockCrouching') return { id: 'blockCrouching', localFrame: snapshot.stateFrame };
  if (state === 'hitStun') return { id: 'hit', localFrame: snapshot.stateFrame };
  if (state === 'knockdown') return { id: 'knockdown', localFrame: snapshot.stateFrame };
  if (state === 'wakeUp') {
    return { id: 'wakeUp', localFrame: snapshot.stateFrame, phaseFrames: WAKE_UP_FRAMES };
  }
  if (state === 'grabbedFront') {
    return {
      id: 'grabbedFront',
      localFrame: snapshot.victimPhaseFrame,
      ...(snapshot.victimPoseFrame !== null ? { explicitFrame: snapshot.victimPoseFrame } : {}),
      ...(snapshot.victimPhaseFrames > 0 ? { phaseFrames: snapshot.victimPhaseFrames } : {}),
    };
  }
  if (state === 'grabbedLifted') {
    return {
      id: 'grabbedLifted',
      localFrame: snapshot.victimPhaseFrame,
      ...(snapshot.victimPoseFrame !== null ? { explicitFrame: snapshot.victimPoseFrame } : {}),
      ...(snapshot.victimPhaseFrames > 0 ? { phaseFrames: snapshot.victimPhaseFrames } : {}),
    };
  }
  if (state === 'frozen') {
    return {
      id: 'frozen',
      localFrame: snapshot.victimPhaseFrame,
      // O gelo é um efeito separado. O quadro corporal neutro evita que a
      // arte baked-in aplique uma segunda tintura azul sobre a vítima.
      explicitFrame: snapshot.victimPoseFrame ?? 0,
    };
  }
  if (state === 'thrown') return { id: 'thrown', localFrame: snapshot.stateFrame };
  if (state === 'knockout') return { id: 'knockout', localFrame: snapshot.stateFrame };
  if (state === 'victory') return { id: 'victory', localFrame: snapshot.stateFrame };

  return { id: 'idle', localFrame: snapshot.stateFrame };
}

export function resolveAttachedEffectFrame(
  effect: FighterEffectAsset,
  stateFrame: number,
): number {
  const timelinePhase = effect.frameTimeline
    ?.find(({ range }) => stateFrame >= range.from && stateFrame <= range.to);
  if (timelinePhase) return timelinePhase.frame;
  const effectFrame = stateFrame - (effect.activeRange?.from ?? 0);
  return spriteSheetFrameIndex(
    effect,
    effectFrame,
    effect.activeRange
      ? effect.activeRange.to - effect.activeRange.from + 1
      : undefined,
  );
}

export function resolveAttachedEffect(
  snapshot: FighterSnapshot,
  activeMove: MoveDefinition | null,
  asset: FighterSpriteAsset,
): FighterEffectAsset | undefined {
  if (!activeMove || (activeMove.grab && snapshot.moveConnected === 'none')) return undefined;
  return asset.effects.find((effect) =>
    effect.usage === 'attached'
    && effect.moveId === activeMove.id
    && (!effect.activeRange
      || snapshot.stateFrame >= effect.activeRange.from
      && snapshot.stateFrame <= effect.activeRange.to));
}

/** Efeitos dirigidos por campo numérico do snapshot (ex.: fumaça de redução). */
export function resolveStatusEffects(
  snapshot: FighterSnapshot,
  asset: FighterSpriteAsset,
): readonly FighterEffectAsset[] {
  return asset.effects.filter((effect) => {
    if (effect.usage !== 'status' || !effect.statusField) return false;
    const value = snapshot[effect.statusField];
    return typeof value === 'number' && value > 0;
  });
}

export function resolveStatusEffectFrame(
  effect: FighterEffectAsset,
  statusFramesRemaining: number,
): number {
  // Usa a contagem decrescente para loop estável enquanto o status vive.
  const elapsed = Math.max(0, statusFramesRemaining);
  return spriteSheetFrameIndex(effect, elapsed);
}

/**
 * Mapeia arming/active do snapshot de projétil para frames do sheet.
 * Aviso faz loop; a explosão/active avança sem loop e sem mostrar frame de impacto no arming.
 */
export function resolveProjectileVisualFrame(
  effect: FighterEffectAsset,
  projectile: {
    readonly ageFrames: number;
    readonly armingFrames: number;
    readonly state: 'arming' | 'active';
  },
): number {
  const warningCount = Math.max(
    1,
    Math.min(
      effect.frames,
      effect.warningFrameCount ?? (effect.frames > 1 ? Math.floor(effect.frames / 2) : 1),
    ),
  );

  if (projectile.state === 'arming' || projectile.ageFrames < projectile.armingFrames) {
    if (warningCount <= 1) return 0;
    return projectile.ageFrames % warningCount;
  }

  const activeAge = Math.max(0, projectile.ageFrames - projectile.armingFrames);
  const activeStart = warningCount;
  if (activeStart >= effect.frames) {
    return Math.min(effect.frames - 1, activeAge);
  }
  return Math.min(effect.frames - 1, activeStart + activeAge);
}
