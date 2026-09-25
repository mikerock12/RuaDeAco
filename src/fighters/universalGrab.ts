import type { MoveDefinition } from '../types/combat';

/** Shared close-range lift/slam. Geometry is logical, independent of PNG size. */
export const universalGrab: MoveDefinition = {
  id: 'universalGrab', label: 'Agarrar e esmagar', state: 'heavyAttack', animation: 'universalGrab',
  command: { buttons: ['light', 'heavy'], simultaneous: true, maxGapFrames: 3, bufferFrames: 3, priority: 1000 },
  totalFrames: 66, meterCost: 0, meterGainOnHit: 10, meterGainOnBlock: 0, lockFacing: true,
  hitboxes: [{ range: { from: 6, to: 9 }, boxes: [{
    id: 'universal-grab', kind: 'throw', level: 'mid', x: 0, y: -120, width: 58, height: 115,
    airAvoidable: true, damage: 125, chipDamage: 0, hitStun: 8, blockStun: 0,
    hitStop: 3, priority: 3, knockbackX: 2, knockbackY: 10, knockdown: true,
  }] }],
  grab: {
    // Cravada: a vítima chega ao chão deitada de costas nas mãos do atacante e
    // é solta já em knockdown, sem pairar em 'thrown' nem levantar antes de cair.
    holdStartFrame: 14, releaseFrame: 46, slam: true, throwVelocityX: 2, throwVelocityY: 0,
    victimAnchorX: 48, victimAnchorY: -80, victimRotation: 0, whiffRecoveryFrame: 50,
    // Estados de referência; posição, quadro e rotação vêm de grabVictimArtPose,
    // que mede o ponto de pega em cada folha de vítima e o prende às mãos.
    victimTimeline: [
      { frame: 6, state: 'grabbedFront', poseFrame: 0, victimAnchorX: 44, victimAnchorY: 0, victimRotation: 0 },
      { frame: 14, state: 'grabbedLifted', poseFrame: 0, victimAnchorX: 44, victimAnchorY: -12, victimRotation: 0 },
      { frame: 45, state: 'grabbedLifted', poseFrame: 4, victimAnchorX: 60, victimAnchorY: 0, victimRotation: 0 },
    ],
  },
};
