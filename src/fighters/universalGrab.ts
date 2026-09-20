import type { MoveDefinition } from '../types/combat';

/** Shared close-range lift/slam. Geometry is logical, independent of PNG size. */
export const universalGrab: MoveDefinition = {
  id: 'universalGrab', label: 'Agarrar e esmagar', state: 'heavyAttack', animation: 'universalGrab',
  command: { buttons: ['light', 'heavy'], simultaneous: true, maxGapFrames: 3, bufferFrames: 3, priority: 1000 },
  totalFrames: 66, meterCost: 0, meterGainOnHit: 10, meterGainOnBlock: 0, lockFacing: true,
  hitboxes: [{ range: { from: 6, to: 9 }, boxes: [{
    id: 'universal-grab', kind: 'throw', level: 'mid', x: 0, y: -120, width: 58, height: 115,
    airAvoidable: true, damage: 125, chipDamage: 0, hitStun: 32, blockStun: 0,
    hitStop: 3, priority: 3, knockbackX: 2, knockbackY: 10, knockdown: true,
  }] }],
  grab: {
    holdStartFrame: 14, releaseFrame: 42, throwVelocityX: 2, throwVelocityY: 12,
    victimAnchorX: 48, victimAnchorY: -80, victimRotation: 0, whiffRecoveryFrame: 50,
    victimTimeline: [
      { frame: 6, state: 'grabbedFront', poseFrame: 0, victimAnchorX: 50, victimAnchorY: 0, victimRotation: 0 },
      { frame: 13, state: 'grabbedFront', poseFrame: 5, victimAnchorX: 44, victimAnchorY: -6, victimRotation: 0 },
      { frame: 14, state: 'grabbedLifted', poseFrame: 0, victimAnchorX: 44, victimAnchorY: -12, victimRotation: 0 },
      { frame: 28, state: 'grabbedLifted', poseFrame: 7, victimAnchorX: 48, victimAnchorY: -85, victimRotation: 0 },
      { frame: 34, state: 'grabbedLifted', poseFrame: 7, victimAnchorX: 48, victimAnchorY: -85, victimRotation: 0 },
      { frame: 41, state: 'grabbedLifted', poseFrame: 7, victimAnchorX: 60, victimAnchorY: -40, victimRotation: 1.2 },
    ],
  },
};
