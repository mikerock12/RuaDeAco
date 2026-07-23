import { describe, expect, it } from 'vitest';
import { AVAILABLE_FIGHTERS } from '../../fighters';
import { getFighterSpriteAsset } from '../../fighters/visual';
import type { FighterAnimationId } from '../../types/assets';
import type { GrabVictimState } from '../../types/combat';

/**
 * Invariável cruzada: para todo lutador disponível, todo golpe com
 * grab.victimTimeline e toda vítima disponível, o maior poseFrame pedido
 * deve existir na animação declarada da vítima (maxPoseFrame < frames).
 *
 * Genérica — não lista lutadores manualmente, para não esquecer o próximo.
 */

const VICTIM_STATE_TO_ANIMATION: Readonly<Record<GrabVictimState, FighterAnimationId>> = {
  grabbedFront: 'grabbedFront',
  grabbedLifted: 'grabbedLifted',
  thrown: 'thrown',
  frozen: 'frozen',
};

describe('contrato cruzado grab.victimTimeline × animação da vítima', () => {
  it('todo poseFrame de timeline cabe nas animações de todas as vítimas disponíveis', () => {
    const failures: string[] = [];

    for (const attacker of AVAILABLE_FIGHTERS) {
      for (const move of Object.values(attacker.moves)) {
        const timeline = move.grab?.victimTimeline;
        if (!timeline || timeline.length === 0) continue;

        const maxByState = new Map<GrabVictimState, number>();
        for (const entry of timeline) {
          const previous = maxByState.get(entry.state) ?? -1;
          if (entry.poseFrame > previous) maxByState.set(entry.state, entry.poseFrame);
        }

        for (const victim of AVAILABLE_FIGHTERS) {
          const asset = getFighterSpriteAsset(victim.id);
          if (!asset) {
            failures.push(`${victim.id}: sem FighterSpriteAsset`);
            continue;
          }

          for (const [state, maxPoseFrame] of maxByState) {
            const animationId = VICTIM_STATE_TO_ANIMATION[state];
            const animation = asset.animations[animationId];
            if (!animation) {
              failures.push(
                `${attacker.id}.${move.id} → ${victim.id}.${animationId}: animação ausente`,
              );
              continue;
            }
            if (!(maxPoseFrame < animation.frames)) {
              failures.push(
                `${attacker.id}.${move.id} → ${victim.id}.${animationId}: `
                + `maxPoseFrame=${maxPoseFrame} frames=${animation.frames} `
                + `(exige maxPoseFrame < frames)`,
              );
            }
          }
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('cobre pelo menos um golpe de Guto pedindo poses 0–7 em grabbedLifted', () => {
    const guto = AVAILABLE_FIGHTERS.find((fighter) => fighter.id === 'guto-barba');
    expect(guto).toBeDefined();
    const gancho = guto!.moves.ganchoUrso?.grab?.victimTimeline ?? [];
    const lifted = gancho.filter((entry) => entry.state === 'grabbedLifted').map((e) => e.poseFrame);
    expect(Math.max(...lifted)).toBe(7);
    const front = gancho.filter((entry) => entry.state === 'grabbedFront').map((e) => e.poseFrame);
    expect(Math.max(...front)).toBe(5);

    const dante = getFighterSpriteAsset('dante-sinal');
    expect(dante?.animations.grabbedFront.frames).toBe(8);
    expect(dante?.animations.grabbedLifted.frames).toBe(8);
    expect(5 < (dante?.animations.grabbedFront.frames ?? 0)).toBe(true);
    expect(7 < (dante?.animations.grabbedLifted.frames ?? 0)).toBe(true);
  });
});
