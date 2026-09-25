import type { FighterId } from '../types/combat';
import { GRAB_VICTIM_LANDMARKS, type VictimLandmark } from './grabVictimLandmarks';

/** Contact landmarks for the newly drawn art, in foot-root coordinates. */
export const GRAB_HANDS: Readonly<Record<FighterId, readonly (readonly [number, number])[]>> = {
  "rafa-mare": [
    [42, -111],
    [74, -129],
    [46, -118],
    [40, -68],
    [26, -141],
    [30, -156],
    [7, -216],
    [-43, -193],
    [68, -184],
    [58, -73],
    [57, -62],
    [42, -104]
  ],
  "guto-barba": [
    [60, -139],
    [91, -146],
    [72, -117],
    [19, -39],
    [40, -142],
    [38, -184],
    [7, -243],
    [-23, -242],
    [39, -117],
    [36, -75],
    [40, -20],
    [59, -115]
  ],
  "noir-reflexo": [
    [46, -120],
    [76, -139],
    [58, -118],
    [16, -51],
    [32, -153],
    [37, -167],
    [-2, -228],
    [-4, -228],
    [-36, -180],
    [51, -91],
    [48, -70],
    [54, -107]
  ],
  "astro-riso": [
    [40, -110],
    [66, -116],
    [48, -109],
    [34, -77],
    [26, -131],
    [24, -159],
    [1, -204],
    [-28, -203],
    [-33, -105],
    [42, -74],
    [22, -39],
    [44, -106]
  ],
  "dante-sinal": [
    [52, -126],
    [82, -143],
    [64, -120],
    [28, -45],
    [38, -136],
    [32, -163],
    [1, -207],
    [-4, -207],
    [-22, -85],
    [44, -73],
    [32, -63],
    [36, -109]
  ],
  "leo-violeta": [
    [42, -122],
    [83, -123],
    [58, -116],
    [43, -83],
    [20, -146],
    [22, -150],
    [14, -217],
    [-40, -192],
    [-11, -106],
    [59, -75],
    [43, -12],
    [40, -99]
  ]
};
export const GRAB_POSE_STARTS = [0, 3, 6, 10, 14, 18, 23, 29, 35, 40, 46, 58] as const;
export function grabPoseIndex(frame: number, connected = true): number {
  if (!connected && frame > 9) return 11;
  let index = 0;
  for (let i = 1; i < GRAB_POSE_STARTS.length; i++) if (frame >= GRAB_POSE_STARTS[i]!) index = i;
  return index;
}

/** Frames do agarrão em que a vítima sai do chão e em que fica deitada nas mãos. */
export const GRAB_LIFT_START = 14;
export const GRAB_LIFT_END = 28;
/** Do frame 40 ao 46 as mãos descem e o corpo é cravado no chão; em 46 a vítima é solta deitada. */
export const GRAB_SLAM_START = 40;
export const GRAB_SLAM_END = 46;
/** Corpo deitado de costas sobre as mãos: ângulo alvo do tronco (positivo = cabeça para a frente do atacante, longe dele). */
export const GRAB_HOLD_ANGLE = Math.PI / 2;

/**
 * As folhas grabbed-lifted não são iguais entre os lutadores: Rafa, Guto e Astro
 * já deitam o corpo na própria arte; Noir e Léo inclinam parcialmente; a folha
 * de Dante só tem poses em pé. Cada lutador declara quais quadros usar, em
 * ordem, e quanto o último quadro já inclina o tronco. O código completa a
 * rotação até GRAB_HOLD_ANGLE, girando ao redor do ponto de pega, nunca dos pés.
 */
export const GRAB_LIFT_ART: Readonly<Record<FighterId, { readonly frames: readonly number[]; readonly tilt: number }>> = {
  'rafa-mare': { frames: [0, 1, 2, 3, 4, 5, 6, 7], tilt: 1.42 },
  'guto-barba': { frames: [0, 1, 2, 3, 4, 5, 6, 7], tilt: 1.4 },
  'astro-riso': { frames: [0, 1, 2, 3, 4, 5, 6, 7], tilt: 1.45 },
  'noir-reflexo': { frames: [0, 1, 2, 3, 4, 5], tilt: 0.72 },
  'dante-sinal': { frames: [0, 1, 2, 3, 4], tilt: 0.08 },
  'leo-violeta': { frames: [1, 3, 4, 5], tilt: 0.58 },
};

const smooth = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/** Posição das mãos do atacante em um frame, interpolada entre as poses da folha. */
export function grabHandPoint(attacker: FighterId, frame: number): { x: number; y: number } {
  const index = grabPoseIndex(frame);
  const next = Math.min(index + 1, GRAB_POSE_STARTS.length - 1);
  const span = GRAB_POSE_STARTS[next]! - GRAB_POSE_STARTS[index]!;
  const blend = span ? smooth((frame - GRAB_POSE_STARTS[index]!) / span) : 0;
  const from = GRAB_HANDS[attacker][index]!;
  const to = GRAB_HANDS[attacker][next]!;
  return { x: from[0] + (to[0] - from[0]) * blend, y: from[1] + (to[1] - from[1]) * blend };
}

export interface GrabVictimArtPose {
  readonly state: 'grabbedFront' | 'grabbedLifted';
  readonly poseFrame: number;
  /** Raiz (pés) da vítima relativa à raiz do atacante; x positivo = frente do atacante. */
  readonly x: number;
  readonly y: number;
  /** Rotação aplicada ao sprite, em unidades da frente do atacante (multiplicar por facing). */
  readonly rotation: number;
  /** Ângulo total do tronco (arte + rotação), para as finalizações continuarem o movimento. */
  readonly bodyAngle: number;
  readonly landmark: VictimLandmark;
  /** Atrás do atacante enquanto sobe; à frente dele no arremesso e na cravada. */
  readonly depth: 'behind' | 'front';
}
/** A partir da pose 8 (balanço para a frente) o corpo passa à frente do atacante. */
export const GRAB_FRONT_DEPTH_FRAME = 35;

/** Progresso do levantamento (0 = no chão, 1 = deitado nas mãos). */
export function grabLiftProgress(frame: number): number {
  return smooth((frame - GRAB_LIFT_START) / (GRAB_LIFT_END - GRAB_LIFT_START));
}

/** O tronco tomba para trás logo que os pés saem do chão: curva rápida no início. */
export function grabTiltProgress(frame: number): number {
  const t = Math.max(0, Math.min(1, (frame - GRAB_LIFT_START) / (GRAB_LIFT_END - GRAB_LIFT_START)));
  return 1 - (1 - t) * (1 - t);
}

/** Quadro da folha lifted e inclinação já pintada nele, para um progresso 0..1. */
export function grabLiftArt(victim: FighterId, progress: number): { poseFrame: number; tilt: number } {
  const art = GRAB_LIFT_ART[victim];
  const last = art.frames.length - 1;
  const step = Math.min(last, Math.floor(progress * art.frames.length));
  return { poseFrame: art.frames[step]!, tilt: art.tilt * (last ? step / last : 1) };
}

/**
 * Raiz da vítima para que seu ponto de pega (peito/centro de massa) fique nas
 * mãos do atacante, com o sprite girado ao redor desse ponto.
 * hold: ponto de pega no espaço local do sprite (x positivo = frente da vítima).
 * A vítima olha para o atacante, por isso o x local é espelhado.
 */
export function rootFromHold(hand: { x: number; y: number }, hold: VictimLandmark, rotation: number): { x: number; y: number } {
  const vx = -hold[0];
  const vy = hold[1];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: hand.x - (vx * cos - vy * sin), y: hand.y - (vx * sin + vy * cos) };
}

/** Pose da vítima durante o agarrão universal, frame a frame do atacante. */
export function grabVictimArtPose(attacker: FighterId, victim: FighterId, frame: number): GrabVictimArtPose {
  const hand = grabHandPoint(attacker, frame);
  const landmarks = GRAB_VICTIM_LANDMARKS[victim];
  if (frame < GRAB_LIFT_START) {
    // Pega frontal: a vítima continua de pé; só o peito acompanha as mãos que sobem.
    const poseFrame = Math.min(7, Math.max(0, Math.floor((frame - 6) * 8 / (GRAB_LIFT_START - 6))));
    const landmark = landmarks.front[poseFrame]!;
    const root = rootFromHold(hand, landmark, 0);
    return { state: 'grabbedFront', poseFrame, x: root.x, y: 0, rotation: 0, bodyAngle: 0, landmark, depth: 'behind' };
  }
  const progress = grabLiftProgress(frame);
  const art = grabLiftArt(victim, progress);
  const landmark = landmarks.lifted[art.poseFrame]!;
  const bodyAngle = GRAB_HOLD_ANGLE * grabTiltProgress(frame);
  const rotation = bodyAngle - art.tilt;
  const root = rootFromHold(hand, landmark, rotation);
  // Cravada: as mãos já estão baixas; o corpo encosta no chão um frame antes da soltura.
  const slam = Math.max(0, Math.min(1, (frame - GRAB_SLAM_START) / (GRAB_SLAM_END - 1 - GRAB_SLAM_START)));
  const y = Math.min(0, root.y) * (1 - slam);
  return { state: 'grabbedLifted', poseFrame: art.poseFrame, x: root.x, y, rotation, bodyAngle, landmark,
    depth: frame >= GRAB_FRONT_DEPTH_FRAME ? 'front' : 'behind' };
}
