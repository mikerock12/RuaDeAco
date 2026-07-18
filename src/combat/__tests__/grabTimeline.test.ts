import { describe, expect, it } from 'vitest';
import { gutoBarba } from '../../fighters/gutoBarba';
import { resolveGrabVictimPose } from '../grabTimeline';

describe('grab victim timeline', () => {
  it('alcança as oito poses da vítima e mantém âncoras contínuas no Gancho', () => {
    const definition = gutoBarba.moves.ganchoUrso!.grab!;
    const poses = Array.from({ length: 27 }, (_, index) =>
      resolveGrabVictimPose(definition, index + 8)!);

    expect(new Set(poses.filter(({ state }) => state === 'grabbedFront').map(({ poseFrame }) => poseFrame)))
      .toEqual(new Set([0, 1, 2, 3, 4, 5]));
    expect(new Set(poses.filter(({ state }) => state === 'grabbedLifted').map(({ poseFrame }) => poseFrame)))
      .toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));

    for (let index = 1; index < poses.length; index += 1) {
      expect(Math.abs(poses[index]!.victimAnchorX - poses[index - 1]!.victimAnchorX)).toBeLessThanOrEqual(6);
      expect(Math.abs(poses[index]!.victimAnchorY - poses[index - 1]!.victimAnchorY)).toBeLessThanOrEqual(7);
      expect(Math.abs(poses[index]!.victimRotation - poses[index - 1]!.victimRotation)).toBeLessThanOrEqual(0.1);
    }
  });

  it('estabiliza completamente a vítima durante formação, casca e ruptura do gelo', () => {
    const definition = gutoBarba.moves.abracoGlacial!.grab!;
    const frozen = Array.from({ length: 63 }, (_, index) =>
      resolveGrabVictimPose(definition, index + 28)!);
    expect(frozen.every(({ state }) => state === 'frozen')).toBe(true);
    expect(new Set(frozen.map(({ victimAnchorX }) => victimAnchorX))).toEqual(new Set([41]));
    expect(new Set(frozen.map(({ victimAnchorY }) => victimAnchorY))).toEqual(new Set([-4]));
    expect(new Set(frozen.map(({ victimRotation }) => victimRotation))).toEqual(new Set([0]));
    expect(new Set(frozen.map(({ poseFrame }) => poseFrame))).toEqual(new Set([0]));
  });

  it('rejeita keyframes fora de ordem', () => {
    const definition = {
      ...gutoBarba.moves.ganchoUrso!.grab!,
      victimTimeline: [
        { frame: 2, state: 'grabbedFront' as const, poseFrame: 0, victimAnchorX: 0, victimAnchorY: 0, victimRotation: 0 },
        { frame: 1, state: 'grabbedFront' as const, poseFrame: 1, victimAnchorX: 1, victimAnchorY: 0, victimRotation: 0 },
      ],
    };
    expect(() => resolveGrabVictimPose(definition, 1)).toThrow(/strictly increasing/);
  });
});
